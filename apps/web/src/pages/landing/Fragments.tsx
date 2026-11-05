import { Icon } from '../../components/Icon';

/** Small, static pieces of the real product UI for the landing collage. EXAMPLE DATA (Northlight bills Beta Labs). */

export function FragVerdict({ pass }: { pass: boolean }) {
  return (
    <div className={`frag verdict ${pass ? 'verdict--pass' : 'verdict--fail'}`}>
      <div className="verdict__icon"><Icon name={pass ? 'check' : 'x'} /></div>
      <div className="stack stack--sm" style={{ gap: 4 }}>
        <strong className="frag__title">{pass ? 'PASS: matches northlight-design.example' : 'FAIL: do not pay this invoice'}</strong>
        <span className="small" style={{ color: 'var(--p-ink)' }}>{pass ? 'Signer and payout wallet are listed on the domain.' : '2 of 10 checks failed.'}</span>
      </div>
    </div>
  );
}

const ROWS: [string, boolean][] = [
  ['Signature matches the invoice', true],
  ['Payout wallet is listed on the domain', true],
  ['Signer is listed on the domain', true],
  ['Invoice is still open', true],
];

export function FragChecks({ fail }: { fail?: boolean }) {
  const rows: [string, boolean][] = fail ? [['Signature matches the invoice', false], ['Payout wallet is listed on the domain', false], ['Signer is listed on the domain', true], ['Invoice is still open', true]] : ROWS;
  return (
    <div className="frag card card--flush">
      <ul className="checklist">
        {rows.map(([t, ok]) => (
          <li key={t} data-ok={ok}>
            <span className="checklist__icon"><Icon name={ok ? 'check' : 'x'} /></span>
            <strong style={{ fontSize: 14 }}>{t}<span className="checklist__state">{ok ? 'PASS' : 'FAIL'}</span></strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FragInvoice({ payout = '0x3B9c…9B0c', bad }: { payout?: string; bad?: boolean }) {
  return (
    <div className="frag card stack" style={{ gap: 12 }}>
      <div className="row row--between">
        <div>
          <span className="label">Invoice from</span>
          <div className="frag__title">Northlight Design Studio</div>
        </div>
        <span className="badge"><Icon name="file" />Issued</span>
      </div>
      <div className="frag__amount">1,250 <span>USDT</span></div>
      <dl className="kv small">
        <dt>Pays to</dt>
        <dd><code className={bad ? 'frag__bad' : undefined}>{payout}</code></dd>
        <dt>Billed to</dt>
        <dd>Beta Labs · net 30</dd>
      </dl>
    </div>
  );
}

export function FragPay({ disabled }: { disabled?: boolean }) {
  return (
    <div className="frag card stack" style={{ gap: 10 }}>
      <button type="button" tabIndex={-1} aria-hidden="true" className="btn btn--primary btn--block" disabled={disabled}>
        <Icon name={disabled ? 'x' : 'wallet'} size={18} />Pay 1,250 USDT
      </button>
      <span className="small" style={disabled ? { color: 'var(--bad)', fontWeight: 500 } : { color: 'var(--p-muted)' }}>
        {disabled ? 'Payment is blocked: 2 checks failed.' : 'One signature, no gas.'}
      </span>
    </div>
  );
}

export function FragReceipt() {
  return (
    <div className="frag card receipt stack" style={{ gap: 10 }}>
      <span className="badge badge--ok" style={{ alignSelf: 'flex-start' }}><Icon name="check" />Paid</span>
      <div className="frag__amount">1,250 <span>USDT</span></div>
      <dl className="kv small">
        <dt>Paid to</dt>
        <dd><code>0x3B9c…9B0c</code></dd>
        <dt>Transaction</dt>
        <dd><code>0x8f21c0…a94e17</code></dd>
      </dl>
    </div>
  );
}

export function FragPin() {
  return (
    <div className="frag notice notice--warn">
      <Icon name="alert" />
      <div>
        <p><strong>This domain’s wallets changed since your last payment.</strong></p>
        <p>Confirm with the merchant before you pay.</p>
      </div>
    </div>
  );
}

export function FragFile() {
  return (
    <pre className="frag codeblock">{`// northlight-design.example/.well-known/truce.json
{
  "version": 1,
  "name": "Northlight Design Studio",
  "signingAddress": "0x7a1E…e1F2",
  "payoutAddresses": ["0x3B9c…9B0c"],
  "chainIds": [1874]
}`}</pre>
  );
}

export function FragTimeline() {
  return (
    <div className="frag card">
      <ol className="timeline">
        <li><strong>Invoice created</strong><span className="small muted">3 Nov, 09:12 UTC</span></li>
        <li data-tone="info"><strong>Buyer signed</strong><span className="small muted">5 Nov, 14:40 UTC</span></li>
        <li data-tone="ok"><strong>Paid</strong><span className="small muted">5 Nov, 14:40 UTC</span></li>
      </ol>
    </div>
  );
}
