import { formatUnits } from "viem";
import type { InvoiceRecord } from "../shared/store.js";
import { effectiveStatus } from "./status.js";

export const CSV_COLUMNS = [
  "invoice_id",
  "merchant_name",
  "client_name",
  "amount",
  "currency",
  "due_date",
  "status",
  "paid_at",
  "payer",
  "payout",
  "tx_link",
  "invoice_hash",
  "example_data",
] as const;

/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formula injection: a cell that starts with
 * = + - @ (or a tab/CR) would be run as a formula by Excel or Sheets, so it is prefixed with an apostrophe.
 */
export function csvCell(value: string | number | boolean | undefined): string {
  let s = value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const isoDate = (unix: bigint | number | string) => new Date(Number(unix) * 1000).toISOString();

/** Accountant export: one row per invoice, amounts in token units, links to the explorer. */
export function invoicesToCsv(records: InvoiceRecord[], opts: { now: number; explorerBase: string }): string {
  const rows = records.map((r) => {
    const inv = r.doc.invoice;
    return [
      inv.invoiceId,
      r.doc.details.merchantName,
      r.doc.details.clientName,
      formatUnits(BigInt(inv.amount), 6), // the allowlisted track USDT has 6 decimals
      "USDT",
      isoDate(inv.dueDate).slice(0, 10),
      effectiveStatus(r, opts.now),
      r.payment ? isoDate(r.payment.paidAt) : "",
      r.payment?.payer ?? "",
      inv.payout,
      r.payment?.txHash ? `${opts.explorerBase}/tx/${r.payment.txHash}` : "",
      r.hash,
      r.doc.details.example ? "yes" : "no",
    ].map(csvCell);
  });
  // BOM so Excel reads UTF-8 names correctly; CRLF line ends per RFC 4180.
  return "﻿" + [CSV_COLUMNS.join(","), ...rows.map((c) => c.join(","))].join("\r\n") + "\r\n";
}
