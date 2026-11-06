import type { Hex } from "viem";
import { parseInvoiceDoc } from "@truce/invoice-lib";
import { ChainError, type ChainErrorCode } from "./chain/errors.js";
import type { ChainModule } from "./chain/types.js";
import type { InvoiceRecord, Store } from "./shared/store.js";

export interface SchedulerDeps {
  store: Store;
  chain: ChainModule;
  /** Unix seconds. Injected so tests can move time. */
  now: () => number;
  /** Hashes being settled right now. Shared with the HTTP route so one invoice is never sent twice at once. */
  inFlight: Set<string>;
  /** Seconds after validAfter before the first try (the token needs now > validAfter on chain time). */
  marginSec?: number;
  retryBaseSec?: number;
  retryMaxSec?: number;
  /** Seconds between health snapshots for authorizations that are not due yet. */
  healthEverySec?: number;
  log?: (msg: string) => void;
}

/** Errors that will not fix themselves: the invoice cannot be paid by this wallet or is invalid. */
const FINAL: ChainErrorCode[] = ["WRONG_PAYER", "SIGNATURE_INVALID", "TOKEN_NOT_ALLOWED", "INVALID_DOCUMENT", "EXPIRED"];
/** Within this long after validAfter an AUTH_INVALID may only be clock skew between this server and the chain. */
const SKEW_GRACE_SEC = 120;

export interface TickResult {
  paid: Hex[];
  failed: Hex[];
  retrying: Hex[];
}

/**
 * Collects due-date invoices. Each tick it looks at stored "pay on due date" authorizations:
 *  - before validAfter it only refreshes a health snapshot (balance, blocked, cancelled);
 *  - after validAfter it first asks the chain whether the invoice is already paid, then tries settle();
 *  - failures that may recover (low balance, RPC trouble) retry with backoff until validBefore, then become FAILED;
 *  - failures that cannot recover (cancelled authorization, wrong payer) become FAILED at once.
 * All state is in the store, so a restart resumes where it stopped. The on-chain `paid` check and the shared
 * `inFlight` set prevent a double send.
 */
export class Scheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly d: SchedulerDeps) {}

  start(intervalMs = 5000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick().catch((e) => this.d.log?.(`scheduler tick failed: ${e instanceof Error ? e.message : e}`)), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One pass over every waiting authorization. Returns what happened, for tests and logs. */
  async tick(): Promise<TickResult> {
    const out: TickResult = { paid: [], failed: [], retrying: [] };
    if (this.running) return out; // a slow tick must not overlap the next one
    this.running = true;
    try {
      const t = this.d.now();
      const waiting = await this.d.store.dueSoon(Number.MAX_SAFE_INTEGER);
      for (const rec of waiting) {
        if (rec.auth?.mode !== "due" || (rec.status !== "SCHEDULED_OK" && rec.status !== "AT_RISK")) continue;
        if (this.d.inFlight.has(rec.hash)) continue;
        const outcome = await this.handle(rec, t);
        if (outcome) out[outcome].push(rec.hash);
      }
    } finally {
      this.running = false;
    }
    return out;
  }

  /** Demo and support control: try this invoice now instead of waiting out a backoff. Only acts on a due authorization that has started. */
  async collectNow(hash: Hex): Promise<"paid" | "failed" | "retrying" | "not_due" | "not_scheduled"> {
    const rec = await this.d.store.get(hash);
    if (!rec || rec.auth?.mode !== "due" || (rec.status !== "SCHEDULED_OK" && rec.status !== "AT_RISK")) return "not_scheduled";
    if (this.d.inFlight.has(rec.hash)) return "retrying";
    await this.d.store.update(rec.hash, (r) => {
      if (r.schedule) r.schedule.nextAttemptAt = 0;
    });
    const outcome = await this.handle((await this.d.store.get(hash))!, this.d.now());
    return outcome ?? "not_due";
  }

  private async handle(rec: InvoiceRecord, t: number): Promise<keyof TickResult | undefined> {
    const { store, chain } = this.d;
    const auth = rec.auth!;
    const validAfter = Number(auth.validAfter);
    const validBefore = Number(auth.validBefore);

    // Not due yet: keep a fresh health snapshot so the merchant sees trouble before the due date.
    if (t <= validAfter + (this.d.marginSec ?? 2)) {
      await this.refreshHealth(rec, t);
      return undefined;
    }
    if ((rec.schedule?.nextAttemptAt ?? 0) > t) return undefined;

    // Already paid (a previous attempt confirmed late, or someone paid directly)? Settle only what is unpaid.
    try {
      const st = await chain.onchainStatus(rec.hash);
      if (st.paid) {
        await store.update(rec.hash, (r) => {
          r.status = "PAID";
          r.payment = { payer: st.payer ?? auth.from, paidAt: t, txHash: st.txHash };
          r.events.push({ at: t, type: "paid_onchain", txHash: st.txHash });
        });
        return "paid";
      }
    } catch {
      return this.retryLater(rec, t, "INTERNAL");
    }

    if (t >= validBefore || BigInt(rec.doc.invoice.expiry) < BigInt(t)) {
      await this.fail(rec, t, "WINDOW_ENDED", "The payment window ended before the invoice could be collected.");
      return "failed";
    }

    const parsed = parseInvoiceDoc(rec.doc);
    if (!parsed.ok) {
      await this.fail(rec, t, "INVALID_DOCUMENT", "The stored invoice is damaged.");
      return "failed";
    }

    this.d.inFlight.add(rec.hash);
    try {
      const { txHash } = await chain.settle(
        parsed.value,
        { mode: "due", from: auth.from, validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), v: auth.v, r: auth.r, s: auth.s },
        { clientKey: "scheduler" },
      );
      await store.update(rec.hash, (r) => {
        r.status = "PAID";
        r.payment = { payer: auth.from, paidAt: t, txHash };
        r.health = { reason: "NONE", checkedAt: t };
        r.events.push({ at: t, type: "paid", detail: "collected on the due date", txHash });
      });
      return "paid";
    } catch (e) {
      const code: ChainErrorCode = e instanceof ChainError ? e.code : "INTERNAL";
      if (e instanceof ChainError && code === "PENDING") {
        await store.update(rec.hash, (r) => {
          r.schedule = { attempts: r.schedule?.attempts ?? 0, nextAttemptAt: t + (this.d.retryBaseSec ?? 30) };
          r.events.push({ at: t, type: "pending", txHash: e.details?.txHash as Hex | undefined });
        });
        return "retrying";
      }
      const skew = code === "AUTH_INVALID" && t - validAfter < SKEW_GRACE_SEC;
      if (FINAL.includes(code) || (code === "AUTH_INVALID" && !skew)) {
        await this.fail(rec, t, code, e instanceof Error ? e.message : "The payment could not be collected.");
        return "failed";
      }
      return this.retryLater(rec, t, code);
    } finally {
      this.d.inFlight.delete(rec.hash);
    }
  }

  private async retryLater(rec: InvoiceRecord, t: number, code: string): Promise<"retrying"> {
    const base = this.d.retryBaseSec ?? 30;
    const max = this.d.retryMaxSec ?? 600;
    await this.d.store.update(rec.hash, (r) => {
      const attempts = (r.schedule?.attempts ?? 0) + 1;
      r.schedule = { attempts, nextAttemptAt: t + Math.min(base * 2 ** (attempts - 1), max) };
      r.status = "AT_RISK";
      r.health = { reason: code === "INSUFFICIENT_BALANCE" ? "LOW_BALANCE" : code, checkedAt: t };
      r.events.push({ at: t, type: "collect_retry", detail: code });
    });
    return "retrying";
  }

  private async fail(rec: InvoiceRecord, t: number, code: string, message: string) {
    await this.d.store.update(rec.hash, (r) => {
      r.status = "FAILED";
      r.health = { reason: code === "INSUFFICIENT_BALANCE" ? "LOW_BALANCE" : code, checkedAt: t };
      r.events.push({ at: t, type: "collect_failed", detail: `${code}: ${message}` });
    });
    this.d.log?.(`collection failed for ${rec.hash}: ${code}`);
  }

  private async refreshHealth(rec: InvoiceRecord, t: number) {
    const every = this.d.healthEverySec ?? 60;
    if (rec.health && t - rec.health.checkedAt < every) return;
    const parsed = parseInvoiceDoc(rec.doc);
    if (!parsed.ok) return;
    const a = rec.auth!;
    try {
      const h = await this.d.chain.health(parsed.value, { mode: "due", from: a.from, validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), v: a.v, r: a.r, s: a.s });
      await this.d.store.update(rec.hash, (r) => {
        const next = h.ok || h.reason === "AUTH_EXPIRING" ? "SCHEDULED_OK" : "AT_RISK";
        if (r.status !== next) r.events.push({ at: t, type: next === "AT_RISK" ? "at_risk" : "recovered", detail: h.reason });
        r.status = next;
        r.health = { reason: h.reason, checkedAt: t };
      });
    } catch {
      /* RPC trouble: keep the last snapshot; the next tick tries again */
    }
  }
}
