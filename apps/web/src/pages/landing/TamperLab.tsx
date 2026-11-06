import {
  buildDomainFile, buildInvoice, parseInvoiceDoc, parseUsdt, signInvoice, toWire, TRACK_USDT, verifyInvoiceDoc,
  type Check, type DomainFile, type InvoiceDocWire,
} from '@truce/invoice-lib';
import { useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { Icon } from '../../components/Icon';
import { formatUsdt } from '../../lib/format';

/*
  Tamper lab: a real playground for the core of Truce. A throwaway key made in this browser tab signs a real invoice with
  @truce/invoice-lib, an in-memory truce.json lists its wallets, and every edit re-runs the library's own ten checks.
  The key never leaves the tab and nothing is sent anywhere. All names are EXAMPLE DATA.
*/

const DOMAIN = 'northlight-design.example';
const HONEST_PAYOUT = '0x3b9c4d2e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c' as Address;
const ATTACKER_PAYOUT = '0xbadc0de5a1e4f00d9c2e7b3a8d1f6c4e0b5a9d37' as Address;
const SETTLER = '0xcbe41b98d2333a1bd92d51fbb6fe668c5170ff9d' as Address; // deployments/whitechain-sepolia.json
const CTX = { chainId: 1874, verifyingContract: SETTLER };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type Lab = { merchant: PrivateKeyAccount; attacker: PrivateKeyAccount; file: DomainFile; original: InvoiceDocWire };
type Signer = 'merchant' | 'attacker';

async function signWire(doc: InvoiceDocWire, who: PrivateKeyAccount): Promise<InvoiceDocWire> {
  const next = { ...doc, invoice: { ...doc.invoice, merchant: who.address } };
  const parsed = parseInvoiceDoc(next);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...next, signature: await signInvoice(who, parsed.value.invoice, CTX) };
}

export function TamperLab() {
  const [lab, setLab] = useState<Lab>();
  const [doc, setDoc] = useState<InvoiceDocWire>();
  const [signedFor, setSignedFor] = useState<InvoiceDocWire['invoice']>();
  const [signer, setSigner] = useState<Signer>('merchant');
  const [amountText, setAmountText] = useState('1250');
  const [checks, setChecks] = useState<Check[]>();
  const [busy, setBusy] = useState(false);

  // Build the lab once: two throwaway keys, a signed invoice, the merchant's domain file.
  useEffect(() => {
    let live = true;
    (async () => {
      const merchant = privateKeyToAccount(generatePrivateKey());
      const attacker = privateKeyToAccount(generatePrivateKey());
      const { invoice, details } = buildInvoice({
        merchant: merchant.address, payout: HONEST_PAYOUT, domain: DOMAIN, merchantName: 'Northlight Design Studio', clientName: 'Beta Labs',
        lineItems: [{ description: 'Brand identity', quantity: '1', unitPrice: '1250' }], notes: 'Net 30',
        dueDate: Math.floor(Date.now() / 1000) + 30 * 86_400, validDays: 3, example: true,
      });
      const signature = await signInvoice(merchant, invoice, CTX);
      const original = toWire({ version: 1, invoice, signature, domain: DOMAIN, details });
      const file = buildDomainFile({ name: 'Northlight Design Studio', signingAddress: merchant.address, payoutAddresses: [HONEST_PAYOUT] });
      if (!live) return;
      setLab({ merchant, attacker, file, original });
      setDoc(original);
      setSignedFor(original.invoice);
    })();
    return () => { live = false; };
  }, []);

  // Re-run the library's checks on every change.
  useEffect(() => {
    if (!doc || !lab) return;
    let live = true;
    verifyInvoiceDoc(doc, {
      chainId: CTX.chainId, settler: SETTLER, allowedTokens: [TRACK_USDT], now: BigInt(Math.floor(Date.now() / 1000)),
      resolveDomain: async (d) => (d.toLowerCase() === DOMAIN ? lab.file : null),
    }).then((r) => live && setChecks(r.checks));
    return () => { live = false; };
  }, [doc, lab]);

  const edited = useMemo(() => {
    if (!doc || !signedFor) return new Set<string>();
    return new Set((Object.keys(doc.invoice) as (keyof InvoiceDocWire['invoice'])[]).filter((k) => doc.invoice[k] !== signedFor[k]));
  }, [doc, signedFor]);

  if (!lab || !doc) return <div className="lab card skeleton" style={{ height: 520 }} aria-hidden="true" />;

  const setInvoice = (patch: Partial<InvoiceDocWire['invoice']>) => setDoc({ ...doc, invoice: { ...doc.invoice, ...patch } });
  const pass = !!checks && checks.every((c) => c.ok);
  const failed = checks?.filter((c) => !c.ok) ?? [];
  const expired = BigInt(doc.invoice.expiry) < BigInt(Math.floor(Date.now() / 1000));
  const amountOk = /^\d{1,9}(\.\d{1,6})?$/.test(amountText.trim());

  async function resign(who: Signer) {
    if (!lab || !doc) return;
    setBusy(true);
    const next = await signWire(doc, who === 'merchant' ? lab.merchant : lab.attacker);
    setDoc(next);
    setSignedFor(next.invoice);
    setSigner(who);
    setBusy(false);
  }
  function reset() {
    if (!lab) return;
    setDoc(lab.original);
    setSignedFor(lab.original.invoice);
    setSigner('merchant');
    setAmountText('1250');
  }

  return (
    <div className={`lab ${checks ? (pass ? 'is-pass' : 'is-fail') : ''}`}>
      <div className="lab__edit">
        <div className="lab__row">
          <label htmlFor="lab-amount">Amount (USDT)</label>
          {edited.has('amount') && <span className="lab__edited">edited after signing</span>}
          <input id="lab-amount" className="input" inputMode="decimal" value={amountText} aria-invalid={!amountOk}
            onChange={(e) => { setAmountText(e.target.value); if (/^\d{1,9}(\.\d{1,6})?$/.test(e.target.value.trim())) setInvoice({ amount: parseUsdt(e.target.value).toString() }); }} />
        </div>

        <div className="lab__row" role="radiogroup" aria-labelledby="lab-payout-l">
          <span id="lab-payout-l" className="lab__label">Pays to</span>
          {edited.has('payout') && <span className="lab__edited">edited after signing</span>}
          <div className="lab__seg">
            <button type="button" role="radio" aria-checked={same(doc.invoice.payout, HONEST_PAYOUT)} onClick={() => setInvoice({ payout: HONEST_PAYOUT })}>
              <i style={{ background: 'var(--chart-b)' }} />Merchant payout <span className="mono">{short(HONEST_PAYOUT)}</span>
            </button>
            <button type="button" role="radio" aria-checked={same(doc.invoice.payout, ATTACKER_PAYOUT)} onClick={() => setInvoice({ payout: ATTACKER_PAYOUT })}>
              <i style={{ background: 'var(--bad)' }} />Attacker wallet <span className="mono">{short(ATTACKER_PAYOUT)}</span>
            </button>
          </div>
        </div>

        <div className="lab__row">
          <label htmlFor="lab-domain">Merchant domain in the link</label>
          {doc.domain !== DOMAIN && <span className="lab__edited">changed</span>}
          <input id="lab-domain" className="input input--mono" value={doc.domain} spellCheck={false} onChange={(e) => setDoc({ ...doc, domain: e.target.value.trim() })} />
        </div>

        <label className="lab__toggle">
          <input type="checkbox" checked={expired} onChange={(e) => setInvoice({ expiry: e.target.checked ? String(Math.floor(Date.now() / 1000) - 86_400) : lab.original.invoice.expiry })} />
          <span className="l-switch__track" aria-hidden="true"><span /></span>
          Move the payment window into the past
          {edited.has('expiry') && <span className="lab__edited">edited after signing</span>}
        </label>

        <div className="lab__sign">
          <div>
            <span className="lab__label">Signature</span>
            <strong className={signer === 'attacker' ? 'is-bad' : undefined}>
              {signer === 'merchant' ? 'Merchant wallet' : 'Attacker wallet'} <span className="mono">{short(doc.invoice.merchant)}</span>
            </strong>
            <span className="small muted">{edited.size ? `Signed before ${edited.size} edit${edited.size > 1 ? 's' : ''}` : 'Covers every field shown'}</span>
          </div>
          <div className="lab__sign-actions">
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void resign('merchant')}><Icon name="key" size={16} />Re-sign as merchant</button>
            <button type="button" className="btn btn--secondary lab__evil" disabled={busy} onClick={() => void resign('attacker')}><Icon name="key" size={16} />Sign as attacker</button>
          </div>
        </div>

        <div className="lab__file">
          <span className="lab__label"><Icon name="globe" size={14} />{DOMAIN}/.well-known/truce.json</span>
          <code className={same(lab.file.signingAddress, doc.invoice.merchant) ? 'is-match' : 'is-miss'}>signingAddress {short(lab.file.signingAddress)}</code>
          <code className={same(lab.file.payoutAddresses[0], doc.invoice.payout) ? 'is-match' : 'is-miss'}>payoutAddresses [{short(lab.file.payoutAddresses[0])}]</code>
        </div>
        <button type="button" className="link small" onClick={reset} style={{ alignSelf: 'flex-start' }}><Icon name="refresh" size={14} /> Start over</button>
      </div>

      <div className="lab__result" aria-live="polite">
        <div className="lab__verdict">
          <span className="lab__verdict-icon"><Icon name={pass ? 'check' : 'x'} size={26} /></span>
          <div>
            <strong>{!checks ? 'Checking…' : pass ? 'PASS' : 'FAIL'}</strong>
            <span>{pass ? `Pay ${formatUsdt(doc.invoice.amount)} USDT is enabled` : `${failed.length} of 10 checks failed. Pay stays disabled.`}</span>
          </div>
        </div>
        <ol className="lab__checks">
          {(checks ?? []).map((c) => (
            <li key={c.id} data-ok={c.ok}>
              <span className="live__dot" aria-hidden="true"><Icon name={c.ok ? 'check' : 'x'} size={12} /></span>
              <span>{c.message}</span>
            </li>
          ))}
        </ol>
        <p className="lab__note small">Real checks from <code>@truce/invoice-lib</code>, run in your browser on a key made for this page. Nothing is sent anywhere.</p>
      </div>
    </div>
  );
}

