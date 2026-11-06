import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { InvoiceDocWire } from "@truce/invoice-lib";
import { JsonStore, type InvoiceRecord } from "../src/shared/store.js";
import { merchant } from "./helpers.js";

function rec(hash: string, over: Partial<InvoiceRecord> = {}, merchantAddr: string = merchant.address): InvoiceRecord {
  return {
    hash: hash as InvoiceRecord["hash"],
    doc: { invoice: { merchant: merchantAddr } } as unknown as InvoiceDocWire,
    status: "ISSUED",
    events: [],
    createdAt: 100,
    ...over,
  };
}
const H1 = "0x" + "11".repeat(32);
const H2 = "0x" + "22".repeat(32);
const tmp = () => mkdtempSync(join(tmpdir(), "truce-store-"));

describe("JsonStore", () => {
  it("creates, reads and refuses duplicates", async () => {
    const s = new JsonStore();
    expect(await s.create(rec(H1))).toBe(true);
    expect(await s.create(rec(H1))).toBe(false);
    expect((await s.get(H1 as never))?.status).toBe("ISSUED");
    expect(await s.get(H2 as never)).toBeUndefined();
    expect(await s.count()).toBe(1);
  });

  it("update is a read-modify-write and unknown hashes return undefined", async () => {
    const s = new JsonStore(undefined, () => 500);
    await s.create(rec(H1));
    const out = await s.setStatus(H1 as never, "PAID", { type: "paid", txHash: "0xab" });
    expect(out?.status).toBe("PAID");
    expect(out?.events).toEqual([{ at: 500, type: "paid", txHash: "0xab" }]);
    expect(await s.setStatus(H2 as never, "PAID")).toBeUndefined();
  });

  it("persists to disk, reloads, and leaves no temp file behind", async () => {
    const dir = tmp();
    const file = join(dir, "store.json");
    const s = new JsonStore(file);
    await s.create(rec(H1));
    await s.create(rec(H2));
    await s.setAuth(H1 as never, { mode: "now", from: merchant.address, validAfter: "0", validBefore: "9", v: 27, r: "0x01", s: "0x02" });
    expect(readdirSync(dir)).toEqual(["store.json"]);
    const reopened = new JsonStore(file);
    expect(await reopened.count()).toBe(2);
    expect((await reopened.get(H1 as never))?.auth?.validBefore).toBe("9");
  });

  it("serializes concurrent writes so the file ends up with every change", async () => {
    const dir = tmp();
    const file = join(dir, "store.json");
    const s = new JsonStore(file);
    await Promise.all(Array.from({ length: 25 }, (_, i) => s.create(rec("0x" + i.toString(16).padStart(64, "0")))));
    expect(JSON.parse(readFileSync(file, "utf8")).invoices).toHaveLength(25);
  });

  it("refuses to start on a corrupt file and does not overwrite it", () => {
    const dir = tmp();
    const file = join(dir, "store.json");
    writeFileSync(file, "{ not json");
    expect(() => new JsonStore(file)).toThrow(/NOT overwritten/);
    expect(readFileSync(file, "utf8")).toBe("{ not json");
  });

  it("keeps a backup copy every 20th write", async () => {
    const dir = tmp();
    const file = join(dir, "store.json");
    const s = new JsonStore(file);
    for (let i = 0; i < 21; i++) await s.create(rec("0x" + i.toString(16).padStart(64, "0")));
    expect(existsSync(`${file}.bak`)).toBe(true);
  });

  it("lists by merchant (case-insensitive, newest first)", async () => {
    const s = new JsonStore();
    await s.create(rec(H1, { createdAt: 1 }));
    await s.create(rec(H2, { createdAt: 2 }));
    await s.create(rec("0x" + "33".repeat(32), {}, "0x0000000000000000000000000000000000000001"));
    const list = await s.listByMerchant(merchant.address.toLowerCase() as never);
    expect(list.map((r) => r.hash)).toEqual([H2, H1]);
  });

  it("dueSoon finds scheduled records whose authorization starts before the cutoff", async () => {
    const s = new JsonStore();
    const auth = (validAfter: string) => ({ mode: "due" as const, from: merchant.address, validAfter, validBefore: "999", v: 27, r: "0x01" as const, s: "0x02" as const });
    await s.create(rec(H1, { status: "SCHEDULED_OK", auth: auth("100") }));
    await s.create(rec(H2, { status: "SCHEDULED_OK", auth: auth("900") }));
    await s.create(rec("0x" + "44".repeat(32), { status: "PAID", auth: auth("1") }));
    expect((await s.dueSoon(200)).map((r) => r.hash)).toEqual([H1]);
  });
});

describe("JsonStore write failures", () => {
  it("one failed write does not stop later writes from reaching disk", async () => {
    const dir = tmp();
    const path = join(dir, "store.json");
    const s = new JsonStore(path);
    await s.create(rec(H1));
    // Make the next write fail: a directory sits where the temp file must go.
    const { mkdirSync, rmdirSync } = await import("node:fs");
    mkdirSync(path + ".tmp");
    await expect(s.create(rec(H2))).rejects.toBeTruthy();
    rmdirSync(path + ".tmp");
    await s.update(H1 as never, (r) => {
      r.status = "PAID";
    });
    const onDisk = JSON.parse(readFileSync(path, "utf8")).invoices as InvoiceRecord[];
    expect(onDisk.find((r) => r.hash === H1)?.status).toBe("PAID");
    expect(onDisk.some((r) => r.hash === H2)).toBe(true); // the in-memory record was written by the later, successful write
  });
});
