import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useExampleFlag } from '../app/AppContext';
import { Icon } from '../components/Icon';
import { InvoiceCard } from '../components/invoice/InvoiceCard';
import { OnchainStatus } from '../components/verify/OnchainStatus';
import { useVerification, type Target } from '../components/verify/useVerification';
import { VerdictBanner } from '../components/verify/VerdictBanner';
import { VerificationChecklist } from '../components/verify/VerificationChecklist';
import { SCENARIOS, scenarioHash } from '../lib/api/fixtures';
import { config } from '../lib/config';
import { encodeDoc, parseVerifyInput } from '../lib/doclink';
import { errorMessage } from '../lib/messages';

/** Public verify page: no wallet. Paste a payment link or a hash, see PASS or FAIL and the payment status. */
/** The ten checks, grouped for the empty state. Wording mirrors lib/messages; the real results come from invoice-lib. */
const PREVIEW = [
  { title: 'The document', items: ['Well formed', 'Signed by the merchant wallet', 'Line items unchanged since signing', 'Not expired'] },
  { title: 'The merchant’s domain', items: ['truce.json found on the domain', 'Signing wallet listed there', 'Payout wallet listed there', 'Invoice bound to that domain'] },
  { title: 'The payment', items: ['Accepted token on chain 1874', 'Your wallet is allowed to pay'] },
];

export function VerifyPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('hash') ?? (params.get('doc') ? `#doc=${params.get('doc')}` : '');
  const [input, setInput] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [inputError, setInputError] = useState<string>();

  const target = useMemo<Target | undefined>(() => {
    if (!submitted) return undefined;
    const t = parseVerifyInput(submitted);
    return t.kind === 'invalid' ? undefined : t;
  }, [submitted]);

  const v = useVerification(target);
  useExampleFlag(v.doc?.details.example);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = parseVerifyInput(input);
    if (t.kind === 'invalid') {
      setInputError(t.reason);
      return;
    }
    setInputError(undefined);
    setSubmitted(input.trim());
    setParams(t.kind === 'hash' ? { hash: t.hash } : { doc: encodeDoc(t.doc) }, { replace: true });
  };

  const pick = (hash: string) => {
    setInput(hash);
    setInputError(undefined);
    setSubmitted(hash);
    setParams({ hash }, { replace: true });
  };

  return (
    <div className="wrap app-main">
      <header className="page-head">
        <span className="label">Public check · no wallet needed</span>
        <h1>Check an invoice before you pay</h1>
        <p className="lead muted measure">Paste the payment link you received. We compare it with the wallet list the merchant publishes on its own domain.</p>
      </header>

      <form className="card stack" onSubmit={onSubmit} noValidate style={{ marginBottom: 'var(--s-6)' }}>
        <div className="field">
          <label htmlFor="verify-input">Payment link or invoice hash</label>
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'stretch' }}>
            <input
              id="verify-input"
              className="input input--mono grow"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://…/pay/0x… or 0x…"
              aria-invalid={!!inputError}
              aria-describedby={inputError ? 'verify-error' : 'verify-hint'}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn btn--primary" type="submit" style={{ height: 48 }}>Check this invoice</button>
          </div>
          {inputError ? <span id="verify-error" className="field-error" role="alert">{inputError}</span> : <span id="verify-hint" className="hint">Links in the form /pay/0x…, ?hash=0x… and #doc=… all work.</span>}
        </div>
        {config.demoTools && config.apiMode === 'mock' && (
          <div className="row small" aria-label="Demo invoices">
            <span className="muted">Try:</span>
            {SCENARIOS.slice(0, 6).map((s) => (
              <button key={s.id} type="button" className="link" onClick={() => pick(scenarioHash(s.id))}>{s.label}</button>
            ))}
          </div>
        )}
      </form>

      {!target && !submitted && (
        <section className="verify-preview" aria-labelledby="vp-h">
          <div className="verify-preview__head">
            <span className="verify-preview__icon" aria-hidden="true"><Icon name="shield" size={22} /></span>
            <div>
              <h2 id="vp-h">What we check, in about a second</h2>
              <p className="small muted">All ten must pass before the Pay button wakes up. A swapped payout wallet fails two of them.</p>
            </div>
          </div>
          <div className="verify-preview__groups">
            {PREVIEW.map((g) => (
              <div key={g.title} className="verify-preview__group">
                <h3>{g.title}</h3>
                <ul>{g.items.map((i) => <li key={i}><Icon name="check" size={14} />{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {target && v.error && (
        <div className="state" role="alert">
          <h2>We could not check this invoice</h2>
          <p className="muted">{v.error}</p>
          {target.kind === 'hash' && v.error === errorMessage('NOT_FOUND') && (
            <p className="small muted">
              A bare 0x… value must be the invoice hash. The “Invoice id” shown in an invoice panel is a different value and will not be found here. Use the payment link instead: open the invoice and choose “Copy payment link”, or “Open the public record”.
            </p>
          )}
          <button type="button" className="btn btn--secondary" onClick={v.retry}><Icon name="refresh" size={18} />Try again</button>
        </div>
      )}

      {target && !v.error && (
        <div className="split">
          <div className="stack stack--lg">
            <VerdictBanner verify={v.verify} domain={v.doc?.domain} loading={v.loading} />
            <VerificationChecklist checks={v.verify?.checks} domain={v.doc?.domain ?? 'the domain'} loading={v.loading} />
          </div>
          <div className="stack stack--lg sticky-col">
            {v.loading || !v.doc ? (
              <div className="card skeleton" style={{ height: 420 }} aria-hidden="true" />
            ) : (
              <>
                <OnchainStatus record={v.record} stored={target.kind === 'hash'} />
                <InvoiceCard doc={v.doc} payoutBad={v.verify?.checks.some((c) => c.id === 'payout_in_domain_file' && !c.ok)} signerBad={v.verify?.checks.some((c) => c.id === 'merchant_matches_domain_file' && !c.ok)} />
                {target.kind === 'hash' && v.verify?.result === 'PASS' && (
                  <Link className="btn btn--primary btn--block" to={`/pay/${target.hash}`}>Open the payment page<Icon name="arrow" className="arrow" /></Link>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
