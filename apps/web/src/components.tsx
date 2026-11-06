import type { ReactNode } from "react";
import type { CheckId, InvoiceDocWire } from "@truce/invoice-lib";
import type { InvoiceSummary, VerifyView } from "./api";
import type { PinStatus } from "./pinning";
import { formatDate, formatDateTime, formatUsdt } from "./format";
import { healthText, untilText } from "./schedule";
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
export function InvoiceTable({ items, explorerBase, nowSec = Math.floor(Date.now() / 1000), onCollect }: { items: InvoiceSummary[]; explorerBase: string; nowSec?: number; onCollect?: (hash: string) => void }) {
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
                {(i.status === "AT_RISK" || i.status === "FAILED") && i.healthReason && <div className="check-msg">{healthText(i.healthReason)}</div>}
                {(i.status === "SCHEDULED_OK" || i.status === "AT_RISK") && i.collectAt && (
                  <div className="check-msg">
                    Collects {formatDateTime(i.collectAt)} ({untilText(Number(i.collectAt), nowSec)})
                    {onCollect && Number(i.collectAt) < nowSec && (
                      <>
                        {" "}
                        <button className="button secondary small" onClick={() => onCollect(i.hash)}>
                          Collect now
                        </button>
                      </>
                    )}
                  </div>
                )}
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

/** What happens to an invoice that is scheduled, failed or cancelled; shown on the buyer page and reused in tests. */
export function ScheduleStatus({
  status,
  collectAt,
  healthReason,
  nowSec,
  onCancel,
  cancelBusy,
  canCancel,
}: {
  status: InvoiceSummary["status"];
  collectAt?: string;
  healthReason?: string;
  nowSec: number;
  onCancel?: () => void;
  cancelBusy?: boolean;
  canCancel?: boolean;
}) {
  if (status === "SCHEDULED_OK" || status === "AT_RISK") {
    const atRisk = status === "AT_RISK";
    return (
      <section className={`card schedule ${atRisk ? "at-risk" : ""}`} data-status={status}>
        <h2>
          Payment scheduled <StatusPill status={status} />
        </h2>
        {collectAt && (
          <p>
            The payment will be collected on <strong>{formatDateTime(collectAt)}</strong> ({untilText(Number(collectAt), nowSec)}).
          </p>
        )}
        <p className={atRisk ? "risk-text" : "muted"}>{healthText(healthReason)}</p>
        <p className="hint">Your authorization is a commitment, not locked funds. If the balance is short on the due date, the payment fails and the invoice shows Failed.</p>
        {canCancel && onCancel && (
          <button className="button secondary" onClick={onCancel} disabled={cancelBusy}>
            {cancelBusy ? "Confirm in your wallet…" : "Cancel my authorization"}
          </button>
        )}
      </section>
    );
  }
  if (status === "FAILED") {
    return (
      <section className="card failed" data-status="FAILED">
        <h2>
          Collection failed <StatusPill status="FAILED" />
        </h2>
        <p>{healthText(healthReason === "NONE" || healthReason === undefined ? "WINDOW_ENDED" : healthReason)}</p>
        <p className="hint">Nothing was paid. The merchant can send a new invoice.</p>
      </section>
    );
  }
  if (status === "CANCELLED") {
    return (
      <section className="card failed" data-status="CANCELLED">
        <h2>
          Authorization cancelled <StatusPill status="CANCELLED" />
        </h2>
        <p>The buyer cancelled the payment authorization. Nothing was paid, and it can no longer be used.</p>
      </section>
    );
  }
  return null;
}
