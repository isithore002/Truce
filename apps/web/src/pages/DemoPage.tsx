import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { ADDR, scenarioHash } from '../lib/api/fixtures';
import type { Address, Healthz, Hex, InvoiceDoc } from '../lib/api/types';
import { config } from '../lib/config';
import { docLinkPath } from '../lib/doclink';
import { formatIso, formatUsdt, formatWbt, isHash } from '../lib/format';
import { randomHex } from '../lib/invoiceLib';

type Tamper = { id: string; label: string; what: string; make: (d: InvoiceDoc) => InvoiceDoc };

const TAMPERS: Tamper[] = [
  { id: 'payout', label: 'Swapped payout', what: 'The payout wallet is replaced with an attacker wallet.', make: (d) => ({ ...d, invoice: { ...d.invoice, payout: ADDR.attackerPayout as Address } }) },
  { id: 'amount', label: 'Tampered amount', what: 'The amount is multiplied by ten after signing.', make: (d) => ({ ...d, invoice: { ...d.invoice, amount: (BigInt(d.invoice.amount) * 10n).toString() } }) },
  { id: 'signer', label: 'Wrong signer', what: 'An attacker signs with a wallet the domain does not list.', make: (d) => ({ ...d, invoice: { ...d.invoice, merchant: ADDR.otherSigner as Address }, signature: `${randomHex(64)}1b` as Hex }) },
  { id: 'expired', label: 'Expired', what: 'The payment window is moved into the past.', make: (d) => ({ ...d, invoice: { ...d.invoice, expiry: String(Math.floor(Date.now() / 1000) - 86_400) } }) },
];

/** Demo tools (VITE_DEMO_TOOLS=1): build tampered #doc links from a real invoice, and watch the relayer. */
export function DemoPage() {
  const { toast } = useApp();
  const [hash, setHash] = useState<string>(config.apiMode === 'mock' ? scenarioHash('pass') : '');
  const [doc, setDoc] = useState<InvoiceDoc>();
  const [docError, setDocError] = useState<string>();
  const [health, setHealth] = useState<Healthz>();
  const [healthError, setHealthError] = useState<string>();

  const loadDoc = useCallback((h: string) => {
    if (!isHash(h)) return setDocError('Enter an invoice hash (0x and 64 hex characters).');
    api.getInvoice(h).then((r) => { setDoc(r.doc); setDocError(undefined); }, (e: Error) => { setDoc(undefined); setDocError(e.message); });
  }, []);
  const loadHealth = useCallback(() => {
    api.healthz().then((h) => { setHealth(h); setHealthError(undefined); }, (e: Error) => setHealthError(e.message));
  }, []);

  useEffect(() => {
    if (hash) loadDoc(hash);
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config.demoTools) {
    return (
      <div className="wrap app-main">
        <div className="state"><h1 style={{ fontSize: 'var(--t-h2)' }}>Demo tools are off</h1><p className="muted">Set VITE_DEMO_TOOLS=1 to show this page.</p></div>
      </div>
    );
  }

  return (
    <div className="wrap app-main stack stack--lg">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <span className="label">Demo tools · not for production</span>
        <h1>Attack links and relayer status</h1>
        <p className="lead muted measure">Build a tampered copy of an honest invoice. Each copy travels inside the link, is checked without being stored, and never enables Pay.</p>
      </header>

      <div className="split">
        <section className="card stack" aria-labelledby="tamper-h">
          <h2 id="tamper-h">Tampered copies</h2>
          <form className="field" onSubmit={(e) => { e.preventDefault(); loadDoc(hash); }}>
            <label htmlFor="demo-hash">Honest invoice hash</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="demo-hash" className="input input--mono grow" value={hash} onChange={(e) => setHash(e.target.value)} spellCheck={false} />
              <button type="submit" className="btn btn--secondary" style={{ height: 48 }}>Load invoice</button>
            </div>
            {docError && <span className="field-error" role="alert">{docError}</span>}
          </form>
          {doc && (
            <>
              <p className="small">Base: {doc.details.merchantName} bills {doc.details.clientName} {formatUsdt(doc.invoice.amount)} USDT. <Link className="link" to={`/pay/${hash}`}>Open the honest link</Link></p>
              <ul className="l-rows" style={{ margin: 0 }}>
                {TAMPERS.map((t) => {
                  const path = docLinkPath(t.make(doc));
                  return (
                    <li key={t.id} style={{ alignItems: 'center' }}>
                      <span className="stack stack--sm" style={{ gap: 2 }}><strong style={{ fontWeight: 500 }}>{t.label}</strong><span className="small muted">{t.what}</span></span>
                      <span className="row" style={{ justifyContent: 'flex-end' }}>
                        <Link className="btn btn--primary" to={path}>Open {t.label.toLowerCase()} link</Link>
                        <button type="button" className="icon-btn icon-btn--menu" aria-label={`Copy ${t.label} link`} onClick={() => void navigator.clipboard?.writeText(location.origin + path).then(() => toast('Link copied'))}><Icon name="copy" /></button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section className="card stack" aria-labelledby="ops-h" aria-live="polite">
          <div className="row row--between">
            <h2 id="ops-h">Relayer status</h2>
            <button type="button" className="btn btn--secondary" onClick={loadHealth}><Icon name="refresh" size={18} />Refresh status</button>
          </div>
          {healthError && <p className="field-error" role="alert">{healthError}</p>}
          {!health && !healthError && <div className="skeleton" style={{ height: 160 }} aria-hidden="true" />}
          {health && (
            <>
              <dl className="kv">
                <dt>Service</dt><dd><span className={`badge ${health.ok ? 'badge--ok' : 'badge--bad'}`}><Icon name={health.ok ? 'check' : 'x'} />{health.ok ? 'Up' : 'Down'}</span> {health.chainMode && <span className="small muted">chain mode {health.chainMode}</span>}</dd>
                <dt>Latest block</dt><dd className="mono">{health.block ?? 'unknown'}</dd>
                <dt>Relayer balance</dt><dd>{health.relayerBalanceWei ? formatWbt(health.relayerBalanceWei) : 'unknown'}</dd>
              </dl>
              <span className="label">Last events</span>
              {health.lastEvents?.length ? (
                <ul className="l-rows" style={{ margin: 0 }}>
                  {health.lastEvents.map((e, i) => (
                    <li key={i}><span>{e.event}</span><span className="small muted">{formatIso(e.at)}</span></li>
                  ))}
                </ul>
              ) : <p className="small muted">No events yet.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
