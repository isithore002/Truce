import type { InvoiceRecord, InvoiceStatus } from "../shared/store.js";

/** An unpaid invoice past its expiry reads as EXPIRED (computed on read, nothing is rewritten). */
export function effectiveStatus(rec: InvoiceRecord, now: number): InvoiceStatus {
  const expired = BigInt(rec.doc.invoice.expiry) < BigInt(now);
  return expired && (rec.status === "ISSUED" || rec.status === "SCHEDULED_OK" || rec.status === "AT_RISK" || rec.status === "FAILED") ? "EXPIRED" : rec.status;
}

export function summarize(rec: InvoiceRecord, now: number) {
  const inv = rec.doc.invoice;
  return {
    hash: rec.hash,
    invoiceId: inv.invoiceId,
    merchantName: rec.doc.details.merchantName,
    clientName: rec.doc.details.clientName,
    amount: inv.amount,
    token: inv.token,
    dueDate: inv.dueDate,
    expiry: inv.expiry,
    status: effectiveStatus(rec, now),
    txHash: rec.payment?.txHash,
    paidAt: rec.payment?.paidAt,
    createdAt: rec.createdAt,
    example: rec.doc.details.example,
  };
}
