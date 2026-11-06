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
import { eventLabel } from '../lib/messages';

type Tamper = { id: string; label: string; what: string; fails: string; make: (d: InvoiceDoc) => InvoiceDoc };

const TAMPERS: Tamper[] = [
  { id: 'payout', label: 'Swapped payout wallet', what: 'The payout wallet is replaced with an attacker wallet after the merchant signed.', fails: 'Signature, payout listed on the domain', make: (d) => ({ ...d, invoice: { ...d.invoice, payout: ADDR.attackerPayout as Address } }) },
  { id: 'amount', label: 'Tampered amount', what: 'The amount is multiplied by ten after signing.', fails: 'Signature', make: (d) => ({ ...d, invoice: { ...d.invoice, amount: (BigInt(d.invoice.amount) * 10n).toString() } }) },
  { id: 'signer', label: 'Wrong signer', what: 'An attacker signs with a wallet the domain does not list.', fails: 'Signature, signer listed on the domain', make: (d) => ({ ...d, invoice: { ...d.invoice, merchant: ADDR.otherSigner as Address }, signature: `${randomHex(64)}1b` as Hex }) },
  { id: 'expired', label: 'Expired invoice', what: 'The payment window is moved into the past.', fails: 'Signature, not expired', make: (d) => ({ ...d, invoice: { ...d.invoice, expiry: String(Math.floor(Date.now() / 1000) - 86_400) } }) },
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

      <form className="card demo-base" onSubmit={(e) => { e.preventDefault(); loadDoc(hash); }}>
        <div className="field grow">
          <label htmlFor="demo-hash">Honest invoice hash</label>
          <input id="demo-hash" className="input input--mono" value={hash} onChange={(e) => setHash(e.target.value)} spellCheck={false} />
          {docError && <span className="field-error" role="alert">{docError}</span>}
        </div>
        <button type="submit" className="btn btn--secondary">Load invoice</button>
        {doc && (
          <div className="demo-base__doc">
            <span className="badge badge--ok"><Icon name="check" />Honest</span>
            <span>{doc.details.merchantName} bills {doc.details.clientName} <strong>{formatUsdt(doc.invoice.amount)} USDT</strong></span>
            <Link className="link small" to={`/pay/${hash}`}>Open the honest link</Link>
          </div>
        )}
      </form>

      <section aria-labelledby="tamper-h" className="stack">
        <h2 id="tamper-h" className="section-title">Tampered copies</h2>
        {!doc ? (
          <div className="state"><p className="muted">Load an honest invoice to build its tampered copies.</p></div>
        ) : (
          <ul className="demo-grid">
            {TAMPERS.map((t) => {
              const path = docLinkPath(t.make(doc));
              return (
                <li key={t.id} className="card demo-card">
                  <span className="demo-card__icon" aria-hidden="true"><Icon name="x" size={18} /></span>
                  <h3>{t.label}</h3>
                  <p className="small muted">{t.what}</p>
                  <p className="demo-card__fails"><span>Expect FAIL on</span>{t.fails}</p>
                  <div className="demo-card__actions">
                    <Link className="btn btn--primary" to={path}>Open this link<Icon name="arrow" className="arrow" /></Link>
                    <button type="button" className="icon-btn icon-btn--menu" aria-label={`Copy the ${t.label.toLowerCase()} link`} onClick={() => void navigator.clipboard?.writeText(location.origin + path).then(() => toast('Link copied'))}>
                      <Icon name="copy" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="ops-h" aria-live="polite">
        <div className="row row--between">
          <h2 id="ops-h">Relayer status</h2>
          <button type="button" className="btn btn--secondary" onClick={loadHealth}><Icon name="refresh" size={18} />Refresh status</button>
        </div>
        {healthError && <p className="field-error" role="alert">{healthError}</p>}
        {!health && !healthError && <div className="skeleton" style={{ height: 96 }} aria-hidden="true" />}
        {health && (
          <>
            <div className="ops-tiles">
              <div>
                <span>Service</span>
                <strong className={health.ok ? 'is-ok' : 'is-bad'}><Icon name={health.ok ? 'check' : 'x'} size={18} />{health.ok ? 'Up' : 'Down'}</strong>
                <em>{health.chainMode ? `chain mode ${health.chainMode}` : 'chain mode unknown'}</em>
              </div>
              <div><span>Latest block</span><strong className="mono">{health.block ?? 'unknown'}</strong><em>Whitechain Sepolia · 1874</em></div>
              <div><span>Relayer balance</span><strong>{health.relayerBalanceWei ? formatWbt(health.relayerBalanceWei) : 'unknown'}</strong><em>pays the gas for buyers</em></div>
            </div>
            {health.lastEvents?.length ? (
              <>
                <span className="label">Last events</span>
                <ol className="ops-events">
                  {health.lastEvents.map((e, i) => (
                    <li key={i}><span>{eventLabel(e.event).label}</span><time className="small muted" dateTime={e.at}>{formatIso(e.at)}</time></li>
                  ))}
                </ol>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
