import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { isAddress } from '../../lib/format';
import { buildDomainFile, downloadBlob, loadSetup, saveSetup, validateDomain, type MerchantSetup } from '../../lib/merchantSetup';
import { normaliseDomain } from '../../lib/pins';
import { Icon } from '../Icon';
import { AddressChip } from '../invoice/AddressChip';

export function SetupWizard() {
  const { wallet, connect, toast } = useApp();
  const [s, setS] = useState<MerchantSetup>(loadSetup);
  const [touched, setTouched] = useState(false);
  const [published, setPublished] = useState(false);
  const domain = normaliseDomain(s.domain);
  const domainErr = validateDomain(s.domain);
  const payoutErr = isAddress(s.payout) ? undefined : 'Enter a wallet address: 0x and 40 hex characters';
  const nameErr = s.name.trim() ? undefined : 'Enter the business name customers see';
  const file = wallet.address ? buildDomainFile(s, wallet.address) : undefined;
  const ready = !!wallet.address && !domainErr && !payoutErr && !nameErr && !!file;
  const json = file ? JSON.stringify(file, null, 2) : '';
  const fieldsDone = touched && !domainErr && !payoutErr && !nameErr;
  const done = [!!wallet.address, fieldsDone, published && ready, false];
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
                <button type="button" className="btn btn--primary" onClick={() => { downloadBlob(new Blob([json + '\n'], { type: 'application/json' }), 'truce.json'); setPublished(true); }}>
                  <Icon name="download" size={18} />Download truce.json
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => void navigator.clipboard?.writeText(json).then(() => { toast('Copied'); setPublished(true); })}>
                  <Icon name="copy" size={18} />Copy contents
                </button>
              </div>
              <ul className="small stack stack--sm" style={{ paddingLeft: 18, margin: 0 }}>
                <li>Put the file in a folder named <code>.well-known</code> at the root of your site.</li>
                <li>Serve it over HTTPS with <code>Content-Type: application/json</code>.</li>
                <li>Check it opens: <code>curl https://{domain}/.well-known/truce.json</code></li>
                <li>Changing a wallet later is fine, but buyers who paid before will see a warning.</li>
              </ul>
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
