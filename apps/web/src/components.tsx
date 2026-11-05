import type { ReactNode } from "react";
import type { CheckId, InvoiceDocWire } from "@truce/invoice-lib";
import type { VerifyView } from "./api";
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
