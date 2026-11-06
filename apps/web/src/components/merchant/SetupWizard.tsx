import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { api } from '../../lib/api';
import type { DomainCheck } from '../../lib/api/types';
import { isAddress } from '../../lib/format';
import { buildDomainFile, downloadBlob, loadSetup, saveSetup, validateDomain, type MerchantSetup } from '../../lib/merchantSetup';
import { normaliseDomain } from '../../lib/pins';
import { Icon } from '../Icon';
import { AddressChip } from '../invoice/AddressChip';

export function SetupWizard() {
  const { wallet, connect, toast } = useApp();
  const [s, setS] = useState<MerchantSetup>(loadSetup);
  const [touched, setTouched] = useState(false);
  const [check, setCheck] = useState<{ key: string; result?: DomainCheck; error?: string }>();
  const [checking, setChecking] = useState(false);
  const domain = normaliseDomain(s.domain);
  const domainErr = validateDomain(s.domain);
  const payoutErr = isAddress(s.payout) ? undefined : 'Enter a wallet address: 0x and 40 hex characters';
  const nameErr = s.name.trim() ? undefined : 'Enter the business name customers see';
  const file = wallet.address ? buildDomainFile(s, wallet.address) : undefined;
  const ready = !!wallet.address && !domainErr && !payoutErr && !nameErr && !!file;
  const json = file ? JSON.stringify(file, null, 2) : '';
  const fieldsDone = touched && !domainErr && !payoutErr && !nameErr;
  // The result belongs to the exact domain and wallets it was run for; change any of them and it no longer counts.
  const checkKey = `${domain}|${wallet.address ?? ''}|${s.payout}`;
  const current = check?.key === checkKey ? check : undefined;
  const verified = current?.result?.status === 'OK';
  const done = [!!wallet.address, fieldsDone, ready && verified, false];

  async function runCheck() {
    if (!ready || !wallet.address || !isAddress(s.payout)) return;
    const key = checkKey;
    setChecking(true);
    try {
      setCheck({ key, result: await api.checkDomain(domain, wallet.address, s.payout) });
    } catch (e) {
      setCheck({ key, error: e instanceof Error ? e.message : 'The check could not run.' });
    } finally {
      setChecking(false);
    }
  }
  const active = done.findIndex((d) => !d);
  const stepState = (i: number) => (done[i] ? 'done' : i === active ? 'active' : 'todo');
  const set = (k: keyof MerchantSetup) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });

  return (
    <ol className="steps">
      <li data-done={done[0]} data-step={stepState(0)}>
        <div className="card stack">
          <h2>Connect your signing wallet</h2>
          <p className="small muted">This wallet signs every invoice. Use a wallet you already back up; Truce never sees its key.</p>
          {wallet.address ? (
            <AddressChip value={wallet.address} label="Signing wallet" />
          ) : (
            <div><button type="button" className="btn btn--primary" onClick={() => connect('merchant')}><Icon name="wallet" size={18} />Connect wallet</button></div>
          )}
          {wallet.error && <p className="field-error" role="alert">{wallet.error}</p>}
        </div>
      </li>

      <li data-done={done[1]} data-step={stepState(1)}>
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!domainErr && !payoutErr && !nameErr) { saveSetup({ ...s, domain }); toast('Setup saved in this browser'); } }} noValidate>
          <h2>Name your domain and payout wallet</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="su-name">Business name</label>
              <input id="su-name" className="input" value={s.name} onChange={set('name')} aria-invalid={touched && !!nameErr} aria-describedby="su-name-e" />
              {touched && nameErr && <span id="su-name-e" className="field-error">{nameErr}</span>}
            </div>
            <div className="field">
              <label htmlFor="su-domain">Domain</label>
              <input id="su-domain" className="input input--mono" value={s.domain} onChange={set('domain')} placeholder="acme.com" aria-invalid={touched && !!domainErr} aria-describedby="su-domain-e" autoComplete="off" spellCheck={false} />
              {touched && domainErr ? <span id="su-domain-e" className="field-error">{domainErr}</span> : <span id="su-domain-e" className="hint">The site your customers already know.</span>}
            </div>
            <div className="field span-2">
              <label htmlFor="su-payout">Payout wallet</label>
              <input id="su-payout" className="input input--mono" value={s.payout} onChange={set('payout')} placeholder="0x…" aria-invalid={touched && !!payoutErr} aria-describedby="su-payout-e" autoComplete="off" spellCheck={false} />
              {touched && payoutErr ? <span id="su-payout-e" className="field-error">{payoutErr}</span> : <span id="su-payout-e" className="hint">Where buyers’ USDT goes. The contract pays only this wallet.</span>}
            </div>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn--secondary">Save setup</button>
            {wallet.address && !isAddress(s.payout) && (
              <button type="button" className="link" onClick={() => setS({ ...s, payout: wallet.address! })}>Use my signing wallet as payout</button>
            )}
          </div>
        </form>
      </li>

      <li data-done={done[2]} data-step={stepState(2)}>
        <div className="card stack">
          <h2>Publish truce.json on your domain</h2>
          {!ready ? (
            <p className="small muted">Connect a wallet and fill in the fields above to generate the file.</p>
          ) : (
            <>
              <p className="small">Upload this file so it opens at <code>https://{domain}/.well-known/truce.json</code>.</p>
              <pre className="codeblock" aria-label="truce.json contents">{json}</pre>
              <div className="btn-row">
                <button type="button" className="btn btn--secondary" onClick={() => downloadBlob(new Blob([json + '\n'], { type: 'application/json' }), 'truce.json')}>
                  <Icon name="download" size={18} />Download truce.json
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => void navigator.clipboard?.writeText(json).then(() => toast('Copied'))}>
                  <Icon name="copy" size={18} />Copy contents
                </button>
              </div>
              <ul className="small stack stack--sm" style={{ paddingLeft: 18, margin: 0 }}>
                <li>Put the file in a folder named <code>.well-known</code> at the root of your site.</li>
                <li>Serve it over HTTPS with <code>Content-Type: application/json</code>, at exactly that address (a redirect, for example from <code>www</code>, is not followed).</li>
                <li>Changing a wallet later is fine, but buyers who paid before will see a warning.</li>
                {domain.endsWith('.example') && (
                  <li>Names ending in <code>.example</code> are fictional demo domains and cannot be published on the internet. A demo server answers for them from its own example list.</li>
                )}
              </ul>
              <div className="btn-row">
                <button type="button" className="btn btn--primary" onClick={() => void runCheck()} disabled={checking} data-testid="check-domain">
                  <Icon name="check" size={18} />{checking ? 'Checking…' : 'Check my domain'}
                </button>
                <span className="small muted">Reads the file from your domain now, the way your buyers’ check does.</span>
              </div>
              {checking && <output className="small muted">Reading https://{domain}/.well-known/truce.json…</output>}
              {current?.error && (
                <div className="notice notice--warn" role="alert"><Icon name="alert" /><p>{current.error}</p></div>
              )}
              {current?.result && (
                <div className={`notice ${verified ? 'notice--ok' : 'notice--bad'}`} role={verified ? 'status' : 'alert'} data-testid="domain-check-result">
                  <Icon name={verified ? 'check' : 'alert'} />
                  <div className="stack stack--sm">
                    <p><strong>{verified ? 'Your domain is set up.' : 'Not set up yet.'}</strong> {current.result.message}</p>
                    {current.result.listed && !verified && (
                      <div className="stack stack--sm">
                        <p className="small">The file currently lists:</p>
                        <AddressChip value={current.result.listed.signingAddress} label="Signing wallet" />
                        {current.result.listed.payoutAddresses.map((a) => <AddressChip key={a} value={a} label="Payout wallet" />)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </li>

      <li data-done={false} data-step={stepState(3)}>
        <div className="card stack">
          <h2>Send your first invoice</h2>
          <p className="small muted">Create an invoice, send the link, and check it yourself on the public verify page first.</p>
          <div className="btn-row">
            <Link className="btn btn--primary" to="/merchant">Create an invoice<Icon name="arrow" className="arrow" /></Link>
            <Link className="btn btn--secondary" to="/verify">Open the verify page</Link>
          </div>
        </div>
      </li>
    </ol>
  );
}
