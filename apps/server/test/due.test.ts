import { describe, expect, it } from "vitest";
import { signCancelAuthorization, toWire, type BuyerAuth, type InvoiceDoc } from "@truce/invoice-lib";
import { Scheduler } from "../src/scheduler.js";
import { setup } from "./appSetup.js";
import { AMOUNT, PAYOUT, T0, attacker, buyer, makeAuth, makeDoc, tokenCtx } from "./helpers.js";

type Env = ReturnType<typeof setup>;
const wire = (a: BuyerAuth) => ({ mode: a.mode, from: a.from, validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), v: a.v, r: a.r, s: a.s });
const create = async (app: Env["app"], doc: InvoiceDoc) => (await app.inject({ method: "POST", url: "/api/invoices", payload: toWire(doc) })).json().hash as string;
const schedule = (app: Env["app"], hash: string, a: object) => app.inject({ method: "POST", url: `/api/invoices/${hash}/authorize`, payload: a });
const get = async (app: Env["app"], hash: string) => (await app.inject({ method: "GET", url: `/api/invoices/${hash}` })).json();

async function scheduled(env: Env, over = {}) {
  const doc = await makeDoc(over);
  const hash = await create(env.app, doc);
  const auth = await makeAuth(doc, "due");
  const res = await schedule(env.app, hash, wire(auth));
  return { doc, hash, auth, res };
}

describe("POST /api/invoices/:hash/authorize (pay on the due date)", () => {
  it("stores the authorization, marks the invoice scheduled and moves no money yet", async () => {
    const env = setup();
    const before = env.chain.balanceOf(PAYOUT);
    const { hash, doc, res } = await scheduled(env);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "SCHEDULED_OK", collectAt: doc.invoice.dueDate.toString() });
    const inv = await get(env.app, hash);
    expect(inv.status).toBe("SCHEDULED_OK");
    expect(inv.schedule).toEqual({ validAfter: doc.invoice.dueDate.toString(), validBefore: doc.invoice.expiry.toString() });
    expect(inv.events.map((e: { type: string }) => e.type)).toEqual(["created", "scheduled"]);
    expect(env.chain.balanceOf(PAYOUT)).toBe(before);
  });

  it("refuses when the balance is already too low (pre-due check)", async () => {
    const env = setup();
    env.chain.setBalance(buyer.address, AMOUNT - 1n);
    const { hash, res } = await scheduled(env);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INSUFFICIENT_BALANCE");
    expect((await get(env.app, hash)).status).toBe("ISSUED");
  });

  it("refuses a blocked wallet", async () => {
    const env = setup();
    env.chain.setBlocked(buyer.address);
    expect((await scheduled(env)).res.json().error.code).toBe("AUTH_INVALID");
  });

  it("needs a due date in the future", async () => {
    const env = setup();
    expect((await scheduled(env, { dueDate: 0n })).res.json().error.code).toBe("INVALID_DOCUMENT");
    const late = setup();
    late.set(Number(T0) + 10 * 86_400); // after the default 7-day due date, before expiry
    const out = await scheduled(late);
    expect(out.res.statusCode).toBe(400);
    expect(out.res.json().error.message).toMatch(/pay now/i);
  });

  it("rejects an authorization with the wrong window (a pay-now signature sent as due)", async () => {
    const env = setup();
    const doc = await makeDoc();
    const hash = await create(env.app, doc);
    const nowAuth = await makeAuth(doc, "now");
    const res = await schedule(env.app, hash, { ...wire(nowAuth), mode: "due" });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("AUTH_INVALID");
  });

  it("rejects an authorization signed by somebody else or for another amount", async () => {
    const env = setup();
    const doc = await makeDoc();
    const hash = await create(env.app, doc);
    const auth = await makeAuth(doc, "due");
    const forged = { ...wire(auth), from: attacker.address };
    expect((await schedule(env.app, hash, forged)).json().error.code).toBe("AUTH_INVALID");
    const other = await makeDoc({ amount: AMOUNT + 1n });
    const wrongAmount = wire(await makeAuth(other, "due"));
    expect((await schedule(env.app, hash, wrongAmount)).json().error.code).toBe("AUTH_INVALID");
  });

  it("will not let a second authorization replace a scheduled one", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    const again = await schedule(env.app, hash, wire(await makeAuth(doc, "due")));
    expect(again.statusCode).toBe(409);
  });

  it("honours the payer lock", async () => {
    const env = setup();
    const out = await scheduled(env, { payer: attacker.address });
    expect(out.res.statusCode).toBe(403);
    expect(out.res.json().error.code).toBe("WRONG_PAYER");
  });
});

describe("POST /api/invoices/:hash/collect", () => {
  const collect = (env: Env, hash: string) => env.app.inject({ method: "POST", url: `/api/invoices/${hash}/collect` });

  it("collects right away once the due date has started, even during a backoff", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    env.chain.setBalance(buyer.address, 0n);
    env.set(Number(doc.invoice.dueDate) + 1);
    await env.scheduler.tick(); // fails, backs off 30 s
    env.chain.setBalance(buyer.address, AMOUNT);
    const res = await collect(env, hash);
    expect(res.json()).toEqual({ result: "paid", status: "PAID" });
  });

  it("does nothing before the due date and says so", async () => {
    const env = setup();
    const { hash } = await scheduled(env);
    expect((await collect(env, hash)).json()).toEqual({ result: "not_due", status: "SCHEDULED_OK" });
  });

  it("refuses an invoice with no scheduled payment, and an unknown one", async () => {
    const env = setup();
    const doc = await makeDoc();
    const hash = await create(env.app, doc);
    expect((await collect(env, hash)).statusCode).toBe(400);
    expect((await collect(env, `0x${"ef".repeat(32)}`)).statusCode).toBe(404);
  });
});

describe("Scheduler: collecting on the due date", () => {
  it("settles at the due time, once, and records how", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    const before = env.chain.balanceOf(PAYOUT);

    expect(await env.scheduler.tick()).toEqual({ paid: [], failed: [], retrying: [] }); // not due yet
    expect(env.chain.balanceOf(PAYOUT)).toBe(before);

    env.set(Number(doc.invoice.dueDate) + 1);
    const out = await env.scheduler.tick();
    expect(out.paid).toEqual([hash]);
    expect(env.chain.balanceOf(PAYOUT)).toBe(before + AMOUNT);
    const inv = await get(env.app, hash);
    expect(inv.status).toBe("PAID");
    expect(inv.payment.payer).toBe(buyer.address);
    expect(inv.events.map((e: { type: string }) => e.type)).toEqual(["created", "scheduled", "paid"]);

    env.advance(60);
    expect((await env.scheduler.tick()).paid).toEqual([]); // nothing is sent twice
    expect(env.chain.balanceOf(PAYOUT)).toBe(before + AMOUNT);
  });

  it("does not fire at the due second itself (the token needs now strictly after validAfter)", async () => {
    const env = setup();
    const { doc, hash } = await scheduled(env);
    env.set(Number(doc.invoice.dueDate));
    expect((await env.scheduler.tick()).paid).toEqual([]);
    expect((await get(env.app, hash)).status).toBe("SCHEDULED_OK");
  });

  it("retries with backoff when the balance is short, then collects once it recovers", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    env.chain.setBalance(buyer.address, 0n);
    env.set(Number(doc.invoice.dueDate) + 1);

    expect((await env.scheduler.tick()).retrying).toEqual([hash]);
    let inv = await get(env.app, hash);
    expect(inv.status).toBe("AT_RISK");
    expect(inv.health.reason).toBe("LOW_BALANCE");

    env.advance(10); // inside the 30 s backoff: no attempt
    expect((await env.scheduler.tick()).retrying).toEqual([]);

    env.chain.setBalance(buyer.address, AMOUNT);
    env.advance(30);
    expect((await env.scheduler.tick()).paid).toEqual([hash]);
    inv = await get(env.app, hash);
    expect(inv.status).toBe("PAID");
    expect(inv.events.map((e: { type: string }) => e.type)).toContain("collect_retry");
  });

  it("backs off further after each failure, up to a cap", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    env.chain.setBalance(buyer.address, 0n);
    let t = Number(doc.invoice.dueDate) + 1;
    env.set(t);
    const gaps: number[] = [];
    for (let i = 0; i < 7; i++) {
      await env.scheduler.tick();
      const rec = await env.store.get(hash as `0x${string}`);
      gaps.push(rec!.schedule!.nextAttemptAt - t);
      t = rec!.schedule!.nextAttemptAt;
      env.set(t);
    }
    expect(gaps).toEqual([30, 60, 120, 240, 480, 600, 600]);
  });

  it("becomes FAILED, with the reason, when the window ends before the money is there", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    env.chain.setBalance(buyer.address, 0n);
    env.set(Number(doc.invoice.dueDate) + 1);
    await env.scheduler.tick();
    env.set(Number(doc.invoice.expiry) + 1);
    expect((await env.scheduler.tick()).failed).toEqual([hash]);
    const inv = await get(env.app, hash);
    expect(inv.status).toBe("FAILED");
    expect(inv.events.at(-1).type).toBe("collect_failed");
    const list = (await env.app.inject({ method: "GET", url: `/api/merchants/${doc.invoice.merchant}/invoices` })).json().items[0];
    expect(list.status).toBe("FAILED");
  });

  it("shows FAILED (not a quiet EXPIRED) even if the scheduler never got to run", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    env.set(Number(doc.invoice.expiry) + 5);
    expect((await get(env.app, hash)).status).toBe("FAILED");
  });

  it("fails at once when the buyer cancelled the authorization", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    const cancel = await signCancelAuthorization(buyer, hash as `0x${string}`, tokenCtx);
    await env.chain.cancelAuthorization(buyer.address, hash as `0x${string}`, cancel);
    env.set(Number(doc.invoice.dueDate) + 1000);
    expect((await env.scheduler.tick()).failed).toEqual([hash]);
    expect((await get(env.app, hash)).status).toBe("FAILED");
  });

  it("marks an invoice paid without sending if it was already paid on chain", async () => {
    const env = setup();
    const { hash, doc, auth } = await scheduled(env);
    env.set(Number(doc.invoice.dueDate) + 1);
    await env.chain.settle(doc, auth); // someone submitted it directly
    const before = env.chain.balanceOf(PAYOUT);
    expect((await env.scheduler.tick()).paid).toEqual([hash]);
    expect(env.chain.balanceOf(PAYOUT)).toBe(before);
    expect((await get(env.app, hash)).events.at(-1).type).toBe("paid_onchain");
  });

  it("skips an invoice another request is already settling", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    env.set(Number(doc.invoice.dueDate) + 1);
    const s = new Scheduler({ store: env.store, chain: env.chain, now: () => Number(doc.invoice.dueDate) + 1, inFlight: new Set<string>([hash]), marginSec: 0 });
    expect(await s.tick()).toEqual({ paid: [], failed: [], retrying: [] });
  });

  it("resumes after a restart: a new Scheduler on the same store collects it", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    env.set(Number(doc.invoice.dueDate) + 1);
    const fresh = new Scheduler({ store: env.store, chain: env.chain, now: () => Number(doc.invoice.dueDate) + 1, inFlight: new Set(), marginSec: 0 });
    expect((await fresh.tick()).paid).toEqual([hash]);
  });

  it("flips to AT_RISK before the due date when the wallet is drained, and back when refilled", async () => {
    const env = setup();
    const { hash } = await scheduled(env);
    env.chain.setBalance(buyer.address, 0n);
    env.advance(61);
    await env.scheduler.tick();
    let inv = await get(env.app, hash);
    expect(inv.status).toBe("AT_RISK");
    expect(inv.health.reason).toBe("LOW_BALANCE");

    env.chain.setBalance(buyer.address, AMOUNT);
    env.advance(61);
    await env.scheduler.tick();
    inv = await get(env.app, hash);
    expect(inv.status).toBe("SCHEDULED_OK");
    expect(inv.events.map((e: { type: string }) => e.type)).toEqual(["created", "scheduled", "at_risk", "recovered"]);
  });

  it("does not poll the chain for health more than once per interval", async () => {
    const env = setup();
    await scheduled(env);
    let calls = 0;
    const orig = env.chain.health.bind(env.chain);
    env.chain.health = async (d, a) => {
      calls++;
      return orig(d, a);
    };
    env.advance(61);
    await env.scheduler.tick();
    await env.scheduler.tick();
    env.advance(5);
    await env.scheduler.tick();
    expect(calls).toBe(1);
  });
});

describe("GET /api/invoices/:hash/health and POST /api/invoices/:hash/cancel", () => {
  const health = (env: Env, hash: string) => env.app.inject({ method: "GET", url: `/api/invoices/${hash}/health` });
  const cancel = async (env: Env, hash: string, signer = buyer) => {
    const sig = await signCancelAuthorization(signer, hash as `0x${string}`, tokenCtx);
    return env.app.inject({ method: "POST", url: `/api/invoices/${hash}/cancel`, payload: sig });
  };

  it("reports a live snapshot and says it is not a lock", async () => {
    const env = setup();
    const { hash } = await scheduled(env);
    const ok = (await health(env, hash)).json();
    expect(ok).toMatchObject({ status: "SCHEDULED_OK", scheduled: true, health: { ok: true, reason: "NONE", note: "A snapshot, not a lock." } });
    env.chain.setBalance(buyer.address, 5n);
    const bad = (await health(env, hash)).json();
    expect(bad).toMatchObject({ status: "AT_RISK", health: { ok: false, reason: "LOW_BALANCE", balance: "5" } });
    expect((await get(env.app, hash)).status).toBe("AT_RISK");
  });

  it("says an unscheduled invoice has no health to report", async () => {
    const env = setup();
    const hash = await create(env.app, await makeDoc());
    expect((await health(env, hash)).json()).toEqual({ status: "ISSUED", scheduled: false });
    expect((await health(env, `0x${"ab".repeat(32)}`)).statusCode).toBe(404);
  });

  it("cancels a scheduled payment: the authorization is dead on the token and the invoice reads CANCELLED", async () => {
    const env = setup();
    const { hash, doc, auth } = await scheduled(env);
    const res = await cancel(env, hash);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "CANCELLED" });
    expect(res.json().txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await get(env.app, hash)).status).toBe("CANCELLED");
    // The signed authorization can no longer be used by anyone, and the scheduler leaves it alone.
    await expect(env.chain.settle({ ...doc }, auth)).rejects.toMatchObject({ code: "AUTH_INVALID" });
    env.set(Number(doc.invoice.dueDate) + 1);
    expect(await env.scheduler.tick()).toEqual({ paid: [], failed: [], retrying: [] });
    expect((await get(env.app, hash)).status).toBe("CANCELLED");
  });

  it("refuses a cancellation signed by someone else, and a cancel for an unscheduled invoice", async () => {
    const env = setup();
    const { hash } = await scheduled(env);
    const wrong = await cancel(env, hash, attacker);
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().error.code).toBe("AUTH_INVALID");
    expect((await get(env.app, hash)).status).toBe("SCHEDULED_OK");

    const plain = await create(env.app, await makeDoc());
    expect((await cancel(env, plain)).statusCode).toBe(400);
    expect((await cancel(env, `0x${"cd".repeat(32)}`)).statusCode).toBe(404);
  });

  it("cannot be re-scheduled with the same (now cancelled) authorization", async () => {
    const env = setup();
    const { hash, doc } = await scheduled(env);
    await cancel(env, hash);
    // The nonce is spent on the token, so the same invoice cannot be scheduled again; the merchant issues a new invoice.
    const again = await schedule(env.app, hash, wire(await makeAuth(doc, "due")));
    expect(again.statusCode).toBe(422);
  });
});
