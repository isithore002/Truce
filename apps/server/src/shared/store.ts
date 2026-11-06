import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Address, Hex } from "viem";
import type { InvoiceDocWire, PaymentMode } from "@truce/invoice-lib";

/** docs/INTERFACES.md section 5. REFUNDED states are an overlay on PAID and are not built in the solo scope. */
export type InvoiceStatus = "ISSUED" | "SCHEDULED_OK" | "AT_RISK" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";

/** The buyer's signed authorization as stored: numbers are decimal strings so the file is plain JSON. */
export interface StoredAuth {
  mode: PaymentMode;
  from: Address;
  validAfter: string;
  validBefore: string;
  v: number;
  r: Hex;
  s: Hex;
}

export interface InvoiceEvent {
  /** Unix seconds. */
  at: number;
  type: string;
  detail?: string;
  txHash?: Hex;
}

export interface InvoiceRecord {
  /** The EIP-712 invoice hash (lowercase). Also the primary key. */
  hash: Hex;
  doc: InvoiceDocWire;
  status: InvoiceStatus;
  auth?: StoredAuth;
  payment?: { payer: Address; paidAt: number; txHash?: Hex };
  health?: { reason: string; checkedAt: number };
  /** Due-date collection bookkeeping (survives restarts). */
  schedule?: { attempts: number; nextAttemptAt: number };
  /** Audit trail, oldest first. */
  events: InvoiceEvent[];
  createdAt: number;
}

/** The only way the API and the scheduler touch storage. */
export interface Store {
  get(hash: Hex): Promise<InvoiceRecord | undefined>;
  /** Returns false (and stores nothing) if the hash already exists. */
  create(rec: InvoiceRecord): Promise<boolean>;
  /** Atomic read-modify-write. Returns the new record, or undefined if the hash is unknown. */
  update(hash: Hex, fn: (rec: InvoiceRecord) => void): Promise<InvoiceRecord | undefined>;
  listByMerchant(merchant: Address): Promise<InvoiceRecord[]>;
  /** Records with a stored authorization that is still waiting and becomes valid before `until` (unix seconds). */
  dueSoon(until: number): Promise<InvoiceRecord[]>;
  count(): Promise<number>;

  setAuth(hash: Hex, auth: StoredAuth): Promise<InvoiceRecord | undefined>;
  setStatus(hash: Hex, status: InvoiceStatus, event?: Omit<InvoiceEvent, "at">): Promise<InvoiceRecord | undefined>;
}

const BACKUP_EVERY = 20;

/**
 * Keeps everything in memory and, when given a path, mirrors it to a JSON file after every change.
 * Writes go to a temp file that is then renamed over the real one, so a crash never leaves a half-written
 * file; writes are queued so they land in order. A corrupt file stops startup instead of being overwritten.
 */
export class JsonStore implements Store {
  private readonly records = new Map<string, InvoiceRecord>();
  private queue: Promise<void> = Promise.resolve();
  private writes = 0;

  constructor(
    private readonly path?: string,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (path && existsSync(path)) {
      let parsed: { invoices?: InvoiceRecord[] };
      try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
      } catch (e) {
        throw new Error(`Store file ${path} is not valid JSON. Fix or move it; it was NOT overwritten. (${e instanceof Error ? e.message : e})`);
      }
      for (const rec of parsed.invoices ?? []) this.records.set(rec.hash, rec);
    }
  }

  private persist(): Promise<void> {
    if (!this.path) return Promise.resolve();
    const path = this.path;
    const snapshot = JSON.stringify({ version: 1, invoices: [...this.records.values()] }, null, 2);
    // `.catch` first: one failed write rejects only its own caller; later writes still run.
    const run = this.queue.catch(() => undefined).then(async () => {
      mkdirSync(dirname(path), { recursive: true });
      if (++this.writes % BACKUP_EVERY === 0 && existsSync(path)) copyFileSync(path, `${path}.bak`);
      await writeFile(`${path}.tmp`, snapshot);
      await rename(`${path}.tmp`, path);
    });
    this.queue = run;
    return run;
  }

  async get(hash: Hex) {
    return this.records.get(hash.toLowerCase());
  }

  async create(rec: InvoiceRecord) {
    const key = rec.hash.toLowerCase();
    if (this.records.has(key)) return false;
    this.records.set(key, { ...rec, hash: key as Hex });
    await this.persist();
    return true;
  }

  async update(hash: Hex, fn: (rec: InvoiceRecord) => void) {
    const rec = this.records.get(hash.toLowerCase());
    if (!rec) return undefined;
    fn(rec);
    await this.persist();
    return rec;
  }

  async listByMerchant(merchant: Address) {
    const m = merchant.toLowerCase();
    return [...this.records.values()].filter((r) => r.doc.invoice.merchant.toLowerCase() === m).sort((a, b) => b.createdAt - a.createdAt);
  }

  async dueSoon(until: number) {
    return [...this.records.values()].filter(
      (r) => (r.status === "SCHEDULED_OK" || r.status === "AT_RISK" || r.status === "FAILED") && r.auth !== undefined && Number(r.auth.validAfter) <= until,
    );
  }

  async count() {
    return this.records.size;
  }

  setAuth(hash: Hex, auth: StoredAuth) {
    return this.update(hash, (r) => {
      r.auth = auth;
    });
  }

  setStatus(hash: Hex, status: InvoiceStatus, event?: Omit<InvoiceEvent, "at">) {
    return this.update(hash, (r) => {
      r.status = status;
      if (event) r.events.push({ at: this.now(), ...event });
    });
  }
}
