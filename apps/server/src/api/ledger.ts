import { formatUnits, type Hex } from "viem";
import type { InvoiceRecord } from "../shared/store.js";
import { csvCell } from "./csv.js";

/**
 * A simple journal of the money that moved, built from what the server recorded for each invoice. It is an export for an
 * accountant, not a double-entry accounting system: the account names below are illustrative, not a chart of accounts for
 * any country, and nothing here covers tax, period closing or write-offs.
 */
export const ACCOUNTS = {
  receivable: "Accounts receivable",
  revenue: "Sales revenue",
  cash: "Cash (USDT)",
  returns: "Sales returns",
} as const;
export type Account = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

export type EntryType = "issued" | "payment" | "refund";

export interface LedgerEntry {
  /** Unix seconds. */
  date: number;
  type: EntryType;
  record: InvoiceRecord;
  debit: Account;
  credit: Account;
  /** Token base units (USDT has 6 decimals). */
  amount: bigint;
  txHash?: Hex;
  memo: string;
}

export const LEDGER_COLUMNS = [
  "entry_date",
  "entry_type",
  "invoice_id",
  "client_name",
  "debit_account",
  "credit_account",
  "amount",
  "currency",
  "tx_link",
  "evidence",
  "memo",
  "invoice_hash",
  "example_data",
] as const;

const ORDER: Record<EntryType, number> = { issued: 0, payment: 1, refund: 2 };

/**
 * One entry per money movement:
 *  - issued: the invoice becomes a receivable (debit receivable, credit revenue);
 *  - payment: the buyer's payment settles it (debit cash, credit receivable), with the transaction as evidence;
 *  - refund: money returned to the original payer (debit sales returns, credit cash), one entry per refund.
 * A cancelled authorization, a failed collection or an expiry moves no money, so it has no entry; it stays in the
 * invoice's event history. A rejected swapped-payout copy is never stored, so it appears nowhere.
 */
export function ledgerEntries(records: InvoiceRecord[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const r of records) {
    const amount = BigInt(r.doc.invoice.amount);
    out.push({ date: r.createdAt, type: "issued", record: r, debit: ACCOUNTS.receivable, credit: ACCOUNTS.revenue, amount, memo: "Invoice issued and signed by the merchant" });
    if (r.payment) {
      const scheduled = r.events.some((e) => e.type === "scheduled");
      out.push({
        date: r.payment.paidAt,
        type: "payment",
        record: r,
        debit: ACCOUNTS.cash,
        credit: ACCOUNTS.receivable,
        amount,
        txHash: r.payment.txHash,
        memo: scheduled ? "Collected on the due date from the buyer's signed authorization" : "Paid by the buyer; the relayer paid the gas",
      });
      for (const e of r.events) {
        if (e.type !== "refunded" || !e.detail || !/^\d+$/.test(e.detail)) continue;
        out.push({ date: e.at, type: "refund", record: r, debit: ACCOUNTS.returns, credit: ACCOUNTS.cash, amount: BigInt(e.detail), txHash: e.txHash, memo: "Refund to the original payer" });
      }
    }
  }
  return out.sort((a, b) => a.date - b.date || ORDER[a.type] - ORDER[b.type] || a.record.doc.invoice.invoiceId.localeCompare(b.record.doc.invoice.invoiceId));
}

/** Debit and credit totals per account. Every entry debits one account and credits another by the same amount. */
export function trialBalance(entries: LedgerEntry[]): Record<Account, { debit: bigint; credit: bigint }> {
  const t = Object.fromEntries(Object.values(ACCOUNTS).map((a) => [a, { debit: 0n, credit: 0n }])) as Record<Account, { debit: bigint; credit: bigint }>;
  for (const e of entries) {
    t[e.debit].debit += e.amount;
    t[e.credit].credit += e.amount;
  }
  return t;
}

const iso = (unix: number) => new Date(unix * 1000).toISOString();

/** The journal as CSV: one row per entry, amounts in USDT, a link to the explorer for the entries a transaction backs. */
export function ledgerToCsv(entries: LedgerEntry[], opts: { explorerBase: string }): string {
  const rows = entries.map((e) =>
    [
      iso(e.date),
      e.type,
      e.record.doc.invoice.invoiceId,
      e.record.doc.details.clientName,
      e.debit,
      e.credit,
      formatUnits(e.amount, 6),
      "USDT",
      e.txHash ? `${opts.explorerBase}/tx/${e.txHash}` : "",
      e.txHash ? "on-chain transaction" : "signed invoice",
      e.memo,
      e.record.hash,
      e.record.doc.details.example ? "yes" : "no",
    ].map(csvCell),
  );
  return "﻿" + [LEDGER_COLUMNS.join(","), ...rows.map((c) => c.join(","))].join("\r\n") + "\r\n";
}
