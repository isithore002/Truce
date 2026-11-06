import { describe, expect, it } from "vitest";
import { toWire } from "@truce/invoice-lib";
import type { Hex } from "viem";
import { ACCOUNTS, LEDGER_COLUMNS, ledgerEntries, ledgerToCsv, trialBalance } from "../src/api/ledger.js";
import type { InvoiceEvent, InvoiceRecord, InvoiceStatus } from "../src/shared/store.js";
import { AMOUNT, buyer, makeDoc } from "./helpers.js";

const T = 1_800_000_000;
const TX1: Hex = `0x${"11".repeat(32)}`;
const TX2: Hex = `0x${"22".repeat(32)}`;
const TX3: Hex = `0x${"33".repeat(32)}`;
const EXPLORER = "https://explorer.testnet.whitechain.io";

async function record(over: { status?: InvoiceStatus; paid?: boolean; events?: InvoiceEvent[]; client?: string } = {}): Promise<InvoiceRecord> {
  const doc = await makeDoc();
  const wire = toWire(doc);
  if (over.client) wire.details.clientName = over.client;
  return {
    hash: `0x${"ab".repeat(32)}` as Hex,
    doc: wire,
    status: over.status ?? (over.paid ? "PAID" : "ISSUED"),
    payment: over.paid ? { payer: buyer.address, paidAt: T + 100, txHash: TX1 } : undefined,
    events: over.events ?? [],
    createdAt: T,
  } as InvoiceRecord;
}
const refundEvent = (at: number, amount: bigint, txHash: Hex): InvoiceEvent => ({ at, type: "refunded", detail: amount.toString(), txHash });

describe("ledgerEntries", () => {
  it("an unpaid invoice is only a receivable", async () => {
    const e = ledgerEntries([await record()]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ type: "issued", debit: ACCOUNTS.receivable, credit: ACCOUNTS.revenue, amount: AMOUNT });
    expect(e[0].txHash).toBeUndefined();
  });

  it("a payment settles the receivable into cash and carries its transaction", async () => {
    const e = ledgerEntries([await record({ paid: true })]);
    expect(e.map((x) => x.type)).toEqual(["issued", "payment"]);
    expect(e[1]).toMatchObject({ debit: ACCOUNTS.cash, credit: ACCOUNTS.receivable, amount: AMOUNT, txHash: TX1 });
  });

  it("each refund is its own entry, in date order, after the payment", async () => {
    const r = await record({ paid: true, events: [refundEvent(T + 300, 200n, TX3), refundEvent(T + 200, 500n, TX2)] });
    const e = ledgerEntries([r]);
    expect(e.map((x) => x.type)).toEqual(["issued", "payment", "refund", "refund"]);
    expect(e.filter((x) => x.type === "refund").map((x) => [x.amount, x.txHash])).toEqual([[500n, TX2], [200n, TX3]]);
    expect(e[2]).toMatchObject({ debit: ACCOUNTS.returns, credit: ACCOUNTS.cash });
  });

  it("says when a payment was a collection on the due date", async () => {
    const scheduled = await record({ paid: true, events: [{ at: T + 10, type: "scheduled" }] });
    const now = await record({ paid: true });
    expect(ledgerEntries([scheduled])[1].memo).toContain("due date");
    expect(ledgerEntries([now])[1].memo).toContain("relayer paid the gas");
  });

  it("money that never moved has no entry: cancelled, failed, expired, a pending refund, a malformed amount", async () => {
    for (const status of ["CANCELLED", "FAILED", "EXPIRED"] as const) {
      expect(ledgerEntries([await record({ status, events: [{ at: T + 1, type: "cancelled" }, { at: T + 2, type: "collect_failed" }] })])).toHaveLength(1);
    }
    const r = await record({ paid: true, events: [{ at: T + 5, type: "refund_pending", detail: "100" }, { at: T + 6, type: "refunded", detail: "12.5" }, { at: T + 7, type: "refunded" }] });
    expect(ledgerEntries([r]).map((x) => x.type)).toEqual(["issued", "payment"]);
  });
});

describe("trialBalance (the accounting identities)", () => {
  it("debits equal credits for any mix of invoices", async () => {
    const records = [
      await record(),
      await record({ paid: true }),
      await record({ paid: true, events: [refundEvent(T + 200, 1000n, TX2), refundEvent(T + 300, 2500n, TX3)] }),
    ];
    const tb = trialBalance(ledgerEntries(records));
    const debit = Object.values(tb).reduce((a, x) => a + x.debit, 0n);
    const credit = Object.values(tb).reduce((a, x) => a + x.credit, 0n);
    expect(debit).toBe(credit);
  });

  it("receivable is what is still owed, cash is received minus refunded, returns is what was refunded", async () => {
    const records = [await record(), await record({ paid: true, events: [refundEvent(T + 200, 1000n, TX2)] })];
    const tb = trialBalance(ledgerEntries(records));
    const owed = tb[ACCOUNTS.receivable].debit - tb[ACCOUNTS.receivable].credit;
    expect(owed).toBe(AMOUNT); // only the unpaid one is still owed
    expect(tb[ACCOUNTS.cash].debit - tb[ACCOUNTS.cash].credit).toBe(AMOUNT - 1000n);
    expect(tb[ACCOUNTS.returns].debit).toBe(1000n);
    expect(tb[ACCOUNTS.revenue].credit).toBe(AMOUNT * 2n); // both were issued
  });
});

describe("ledgerToCsv", () => {
  it("has the documented header, a BOM, CRLF lines and an explorer link for each money entry", async () => {
    const csv = ledgerToCsv(ledgerEntries([await record({ paid: true, events: [refundEvent(T + 200, 1000n, TX2)] })]), { explorerBase: EXPLORER });
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(LEDGER_COLUMNS.join(","));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("issued,");
    expect(lines[1]).toContain("signed invoice");
    expect(lines[2]).toContain(`${EXPLORER}/tx/${TX1}`);
    expect(lines[2]).toContain("on-chain transaction");
    expect(lines[3]).toContain(`${EXPLORER}/tx/${TX2}`);
    expect(lines[3]).toContain("0.001"); // 1000 base units = 0.001 USDT
  });

  it("neutralises a spreadsheet formula in a client name", async () => {
    const csv = ledgerToCsv(ledgerEntries([await record({ client: "=HYPERLINK(\"http://evil\")" })]), { explorerBase: EXPLORER });
    const row = csv.replace(/^﻿/, "").split("\r\n")[1];
    expect(row).not.toMatch(/,=HYPERLINK/);
    expect(row).toContain("'=HYPERLINK");
  });

  it("is just the header with no invoices", () => {
    expect(ledgerToCsv([], { explorerBase: EXPLORER }).replace(/^﻿/, "").trim()).toBe(LEDGER_COLUMNS.join(","));
  });
});
