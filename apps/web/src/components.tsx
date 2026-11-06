import type { ReactNode } from "react";
import type { CheckId, InvoiceDocWire } from "@truce/invoice-lib";
import type { InvoiceSummary, VerifyView } from "./api";
import type { PinStatus } from "./pinning";
import { formatDate, formatUsdt } from "./format";
import { navigate } from "./router";

/** An in-app link that does not reload the page. */
export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

const LABELS: Record<CheckId, string> = {
  document_valid: "Invoice is well formed",
  signature_valid: "Merchant's signature is valid",
  domain_file_reachable: "Merchant's published wallet list found",
  merchant_matches_domain_file: "Signer is the wallet the merchant publishes",
  payout_in_domain_file: "Payout wallet is on the merchant's list",
  domain_hash_matches: "Invoice is bound to the merchant's domain",
  chain_and_token_allowed: "Accepted network and token",
  not_expired: "Not expired",
  memo_hash_matches_details: "Line items are what the merchant signed",
  payer_ok: "Payer is allowed",
};

/** The PASS/FAIL badge and the ten plain-language checks behind it. */
export function Checklist({ verdict, domain }: { verdict: VerifyView; domain?: string }) {
  const pass = verdict.result === "PASS";
  const failing = verdict.checks.filter((c) => !c.ok);
  return (
    <section className={`verdict ${pass ? "pass" : "fail"}`} aria-live="polite">
      <div className="badge" role="status">
        <span className="badge-icon" aria-hidden="true">
          {pass ? "✓" : "✕"}
        </span>
        <span className="badge-text">{pass ? "PASS" : "FAIL"}</span>
      </div>
      <p className="verdict-line">
        {pass
          ? `The payee and the details match what ${domain ?? "the merchant"} published and signed.`
          : `Do not pay this invoice. ${failing.length} check${failing.length === 1 ? "" : "s"} failed.`}
      </p>
      <ul className="checks">
        {verdict.checks.map((c) => (
          <li key={c.id} className={c.ok ? "ok" : "bad"} data-check={c.id}>
            <span className="mark" aria-hidden="true">
              {c.ok ? "✓" : "✕"}
            </span>
            <div>
              <div className="check-name">{LABELS[c.id] ?? c.id}</div>
              <div className="check-msg">{c.message}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The invoice as the merchant signed it. Shows the full payout wallet: that is the thing to look at. */
export function InvoiceCard({ doc }: { doc: InvoiceDocWire }) {
  const inv = doc.invoice;
  return (
    <section className="card invoice">
      <div className="invoice-head">
        <div>
          <div className="muted">Invoice from</div>
          <h2>{doc.details.merchantName}</h2>
          <div className="muted">
            {doc.domain} · billed to {doc.details.clientName}
          </div>
        </div>
        <div className="amount">{formatUsdt(inv.amount)}</div>
      </div>
      <table className="lines">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th className="num">Unit price</th>
          </tr>
        </thead>
        <tbody>
          {doc.details.lineItems.map((li, i) => (
            <tr key={i}>
              <td>{li.description}</td>
              <td>{li.quantity}</td>
              <td className="num">{formatUsdt(li.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc.details.notes && <p className="muted">{doc.details.notes}</p>}
      <dl className="facts">
        <dt>Due</dt>
        <dd>{inv.dueDate === "0" ? "On receipt" : formatDate(inv.dueDate)}</dd>
        <dt>Valid until</dt>
        <dd>{formatDate(inv.expiry)}</dd>
        <dt>Pays to</dt>
        <dd className="mono wallet">{inv.payout}</dd>
      </dl>
    </section>
  );
}

export function ExampleTag() {
  return <span className="tag">EXAMPLE DATA</span>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="error-note" role="alert">
      {children}
    </div>
  );
}

const STATUS_TEXT: Record<InvoiceSummary["status"], string> = {
  ISSUED: "Awaiting payment",
  SCHEDULED_OK: "Scheduled",
  AT_RISK: "At risk",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export function StatusPill({ status }: { status: InvoiceSummary["status"] }) {
  const tone = status === "PAID" ? "pass" : status === "FAILED" || status === "EXPIRED" || status === "CANCELLED" ? "fail" : status === "AT_RISK" ? "warn" : "info";
  return <span className={`pill ${tone}`}>{STATUS_TEXT[status]}</span>;
}

/** The merchant's invoice list: status, amount, dates, and links to the pay page and the payment on the explorer. */
export function InvoiceTable({ items, explorerBase }: { items: InvoiceSummary[]; explorerBase: string }) {
  if (items.length === 0) return <p className="muted">No invoices yet. Create the first one above.</p>;
  return (
    <div className="table-wrap">
      <table className="lines invoices">
        <thead>
          <tr>
            <th>Client</th>
            <th className="num">Amount</th>
            <th>Due</th>
            <th>Status</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.hash} data-hash={i.hash}>
              <td>
                {i.clientName} {i.example && <ExampleTag />}
              </td>
              <td className="num">{formatUsdt(i.amount)}</td>
              <td>{i.dueDate === "0" ? "On receipt" : formatDate(i.dueDate)}</td>
              <td>
                <StatusPill status={i.status} />
              </td>
              <td>
                <Link to={`/pay/${i.hash}`}>Pay page</Link> · <Link to={`/verify?hash=${i.hash}`}>Verify</Link>
                {i.txHash && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={`${explorerBase}/tx/${i.txHash}`} target="_blank" rel="noreferrer">
                      Transaction
                    </a>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shown when a merchant's wallets differ from the ones this browser remembers from a previous payment. */
export function PinWarning({
  pin,
  domain,
  invoice,
  ack,
  onAck,
}: {
  pin: PinStatus;
  domain: string;
  invoice: { merchant: string; payout: string };
  ack?: boolean;
  onAck?: (v: boolean) => void;
}) {
  if (pin.status !== "changed") return null;
  return (
    <section className="pin-warning" role="alert" data-pin="changed">
      <h2>Payee changed since your last payment to {domain}</h2>
      <p>
        {pin.signerChanged && pin.payoutChanged
          ? "Both the signing wallet and the payout wallet differ from the ones you paid before."
          : pin.signerChanged
            ? "The signing wallet differs from the one you paid before."
            : "The payout wallet differs from the one you paid before."}{" "}
        This can be legitimate, such as a new bank account, but it is also what a fraudulent invoice looks like. Confirm with {domain} by another channel.
      </p>
      <div className="pin-compare">
        <div>
          <strong>You paid before</strong>
          <p className="mono wallet">Signer {pin.pin.signingAddress}</p>
          <p className="mono wallet">Payout {pin.pin.payoutAddresses.join(", ")}</p>
        </div>
        <div>
          <strong>This invoice</strong>
          <p className="mono wallet">Signer {invoice.merchant}</p>
          <p className="mono wallet">Payout {invoice.payout}</p>
        </div>
      </div>
      {onAck && (
        <label className="ack">
          <input type="checkbox" checked={!!ack} onChange={(e) => onAck(e.target.checked)} /> I have confirmed these new wallets with the merchant.
        </label>
      )}
    </section>
  );
}
