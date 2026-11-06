import { useEffect, useRef, useState } from "react";
import type { InvoiceDocWire } from "@truce/invoice-lib";
import { api, ApiFailure, type Config, type VerifyView } from "../api";
import { Checklist, ErrorNote, InvoiceCard, Link, PinWarning } from "../components";
import { checkPin, loadPins } from "../pinning";
import { extractHash, shortAddress } from "../format";

/** Used only by the demo button, to show what a swapped payout wallet looks like to the buyer. */
const DEMO_ATTACKER = "0x9fc3a0b7d1e5c4e2a8b6f0d3c7e1b5a9d2f4e6c8";

export default function Verify({ config }: { config?: Config }) {
  const initial = new URLSearchParams(window.location.search).get("hash") ?? "";
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [verdict, setVerdict] = useState<VerifyView | undefined>();
  const [doc, setDoc] = useState<InvoiceDocWire | undefined>();
  const [loadedFromHash, setLoadedFromHash] = useState<InvoiceDocWire | undefined>();
  const ran = useRef(false);

  async function run(raw: string) {
    const input = raw.trim();
    setError(undefined);
    setVerdict(undefined);
    if (!input) return setError("Paste a payment link, an invoice hash, or the invoice JSON.");
    setBusy(true);
    try {
      if (input.startsWith("{")) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(input);
        } catch {
          throw new ApiFailure("INVALID_DOCUMENT", "That is not valid JSON.");
        }
        setDoc(parsed && typeof parsed === "object" && "invoice" in parsed && "details" in parsed ? (parsed as InvoiceDocWire) : undefined);
        setVerdict(await api.verifyDoc(parsed));
      } else {
        const hash = extractHash(input);
        if (!hash) throw new ApiFailure("INVALID_DOCUMENT", "Could not find an invoice hash (0x followed by 64 characters) in that text.");
        const [view, v] = await Promise.all([api.invoice(hash), api.verifyHash(hash)]);
        setDoc(view.doc);
        setLoadedFromHash(view.doc);
        setVerdict(v);
      }
    } catch (e) {
      setDoc(undefined);
      setError(e instanceof ApiFailure ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial && !ran.current) {
      ran.current = true;
      void run(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showTampered() {
    if (!loadedFromHash) return;
    const tampered: InvoiceDocWire = { ...loadedFromHash, invoice: { ...loadedFromHash.invoice, payout: DEMO_ATTACKER } };
    const json = JSON.stringify(tampered, null, 2);
    setText(json);
    void run(json);
  }

  const hash = verdict?.invoiceHash;
  return (
    <>
      <h1>Verify an invoice</h1>
      <p className="lead">Paste a payment link, an invoice hash, or the invoice itself. No wallet is needed to check.</p>
      <div className="card">
        <label htmlFor="invoice-input" className="label">
          Payment link, hash or invoice JSON
        </label>
        <textarea id="invoice-input" value={text} onChange={(e) => setText(e.target.value)} rows={text.trim().startsWith("{") ? 10 : 3} spellCheck={false} placeholder="https://.../pay/0x...   or   0x...   or   { ...invoice... }" />
        <div className="row">
          <button className="button" onClick={() => void run(text)} disabled={busy}>
            {busy ? "Checking…" : "Check invoice"}
          </button>
          {loadedFromHash && (
            <button className="button secondary" onClick={showTampered} disabled={busy} title="Demo: edits the payout wallet in this copy, the way an attacker's email would">
              Demo: show a copy with the payout wallet swapped
            </button>
          )}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {verdict && (
        <>
          <Checklist verdict={verdict} domain={doc?.domain} />
          {doc && <PinWarning pin={checkPin(loadPins(typeof localStorage === "undefined" ? undefined : localStorage), doc.domain, doc.invoice)} domain={doc.domain} invoice={doc.invoice} />}
          {doc && <InvoiceCard doc={doc} exampleMode={!!config?.exampleMode} />}
          <section className="card">
            <h2>On chain</h2>
            {verdict.onchain.unavailable ? (
              <p className="muted">The chain could not be reached, so payment status is unknown.</p>
            ) : verdict.onchain.paid ? (
              <p>
                Paid{verdict.onchain.payer ? ` by ${shortAddress(verdict.onchain.payer)}` : ""}.{" "}
                {verdict.onchain.txHash && config && (
                  <a href={`${config.explorerBase}/tx/${verdict.onchain.txHash}`} target="_blank" rel="noreferrer">
                    View the transaction
                  </a>
                )}
              </p>
            ) : (
              <p>Not paid yet.</p>
            )}
            {verdict.result === "PASS" && !verdict.onchain.paid && hash && (
              <Link to={`/pay/${hash}`} className="button">
                Pay this invoice
              </Link>
            )}
          </section>
        </>
      )}
    </>
  );
}
