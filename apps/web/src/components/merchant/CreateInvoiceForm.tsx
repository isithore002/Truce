import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { api, ApiError } from '../../lib/api';
import type { Address, CreateInvoiceResult, Invoice, InvoiceDetails } from '../../lib/api/types';
import { ZERO_ADDRESS } from '../../lib/api/types';
import { chain } from '../../lib/config';
import { dateInputToUnix, formatDue, formatUsdt, isAddress, MAX_DEMO_MINUTES, nowSeconds, parseDemoMinutes, parseQuantity, parseUsdt, unixToDateInput } from '../../lib/format';
import { invoiceLib } from '../../lib/invoiceLib';
import { loadSetup } from '../../lib/merchantSetup';
import { errorMessage } from '../../lib/messages';
import { MAX_SERIES, monthlyDueDates, parseSeriesCount, seriesNote } from '../../lib/series';
import { signTypedData } from '../../lib/wallet';
import { Icon } from '../Icon';
import { BuyerVerdict } from './BuyerVerdict';

interface Line { description: string; quantity: string; price: string }

const DAY = 86_400;
const defaultDue = () => unixToDateInput(Math.floor(Date.now() / 1000) + 30 * DAY);

export function CreateInvoiceForm({ onCreated }: { onCreated: () => void }) {
  const app = useApp();
  const setup = loadSetup();
  const [client, setClient] = useState('');
  const [lines, setLines] = useState<Line[]>([{ description: '', quantity: '1', price: '' }]);
  const [due, setDue] = useState(defaultDue);
  const [demoMinutes, setDemoMinutes] = useState('');
  const [grace, setGrace] = useState('3');
  const [payer, setPayer] = useState('');
  const [notes, setNotes] = useState('Net 30');
  const [example, setExample] = useState(true);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [seriesCount, setSeriesCount] = useState('1');
  // Everything created so far. A series can stop partway (a rejected signature, a network error), so each one is kept as it lands.
  const [created, setCreated] = useState<{ res: CreateInvoiceResult; due: string; index: number; of: number }[]>([]);
  const [todaySec] = useState(() => Math.floor(Date.now() / 1000));

  const parsed = lines.map((l) => ({ q: parseQuantity(l.quantity), p: parseUsdt(l.price), d: l.description.trim() }));
  const total = parsed.reduce((acc, l) => (l.q.ok && l.p.ok ? acc + l.q.value * l.p.value : acc), 0n);
  // The demo "due in N minutes" field only exists for invoices marked EXAMPLE DATA, and wins over the calendar date when filled.
  const demoOn = example && demoMinutes.trim() !== '';
  const minutesN = parseDemoMinutes(demoMinutes);
  const dateUnix = dateInputToUnix(due);
  const seriesN = parseSeriesCount(seriesCount);
  const graceN = /^\d+$/.test(grace) ? Number(grace) : NaN;
  const errors = {
    client: client.trim() ? undefined : 'Enter the client name',
    lines: parsed.some((l) => !l.d || !l.q.ok || !l.p.ok) ? 'Every line needs a description, a whole quantity and a price' : total === 0n ? 'The total must be above 0' : undefined,
    due: demoOn
      ? minutesN ? undefined : `Enter whole minutes from 1 to ${MAX_DEMO_MINUTES}, or clear the field`
      : !dateUnix ? 'Pick a due date' : Number(dateUnix) < todaySec - DAY ? 'The due date is in the past' : undefined,
    // A scheduled payment needs a window after the due time: with 0 days the invoice expires the moment it is due.
    grace: Number.isNaN(graceN) || graceN < 0 || graceN > 90 ? 'Grace is 0 to 90 days' : demoOn && graceN < 1 ? 'Use at least 1 day so the scheduled payment has time to run' : undefined,
    series: demoOn ? (seriesN === 1 ? undefined : 'A series needs a calendar due date. Clear the demo minutes or set the number to 1') : seriesN ? undefined : `Enter a whole number from 1 to ${MAX_SERIES}`,
    payer: payer.trim() && !isAddress(payer.trim()) ? 'Enter a wallet address or leave empty' : undefined,
    setup: !setup.domain || !isAddress(setup.payout) ? 'Finish setup first: domain and payout wallet' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const updateLine = (i: number, k: keyof Line, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(undefined);
    if (!valid) return;
    setBusy(true);
    try {
      const merchant = app.wallet.address ?? (await app.connect('merchant'));
      if (!merchant) throw new Error(app.wallet.error ?? 'Connect your signing wallet first.');
      if (!(await app.switchChain())) throw new Error('Switch your wallet to Whitechain Sepolia (chain 1874).');
      const cfg = app.publicConfig;
      if (!cfg) throw new Error('Server settings are not loaded yet. Try again in a moment.');
      const lineItems = parsed.map((l) => ({ description: l.d, quantity: (l.q as { value: bigint }).value.toString(), unitPrice: (l.p as { value: bigint }).value.toString() }));
      // The clock is read here, at signing time, so a minutes field typed a while ago still means "N minutes from now".
      const firstDue = demoOn ? (minutesN ? String(nowSeconds() + minutesN * 60) : null) : dateUnix;
      if (!firstDue) throw new Error('Check the due date.');
      const dues = monthlyDueDates(firstDue, demoOn ? 1 : (seriesN ?? 1));
      const ctx = { chainId: cfg.chainId ?? chain.id, settler: cfg.settler };
      setCreated([]);
      // One signature and one request per invoice, in order. Each invoice that is made stays made if a later one fails.
      for (const [i, dueAt] of dues.entries()) {
        const details: InvoiceDetails = { merchantName: setup.name, clientName: client.trim(), lineItems, notes: seriesNote(notes.trim(), i, dues.length), example };
        const invoice: Invoice = {
          invoiceId: invoiceLib.newInvoiceId(), merchant, payout: setup.payout as Address, token: cfg.token, amount: total.toString(),
          dueDate: dueAt, expiry: String(Number(dueAt) + graceN * DAY), payer: (payer.trim() || ZERO_ADDRESS) as Address,
          domainHash: invoiceLib.domainHash(setup.domain), memoHash: invoiceLib.memoHash(details),
        };
        let res: CreateInvoiceResult;
        try {
          const signature = await signTypedData(merchant, invoiceLib.invoiceTypedData(invoice, ctx));
          res = await api.createInvoice({ version: 1, invoice, signature, domain: setup.domain, details });
        } catch (err) {
          if (i === 0) throw err;
          onCreated();
          const why = err instanceof ApiError ? errorMessage(err.code, err.message) : (err as Error).message;
          throw new Error(`Created ${i} of ${dues.length}. Invoice ${i + 1} was not created: ${why} The ones already made are listed above and on your dashboard.`);
        }
        setCreated((c) => [...c, { res, due: dueAt, index: i, of: dues.length }]);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err.code, err.message) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created.length > 0) {
    const of = created[0].of;
    const many = of > 1;
    const reset = () => { setCreated([]); setError(undefined); setTouched(false); setClient(''); setSeriesCount('1'); setLines([{ description: '', quantity: '1', price: '' }]); };
    return (
      <section className="card stack" aria-live="polite">
        <span className="badge badge--ok" style={{ alignSelf: 'flex-start' }}><Icon name="check" />{many ? `${created.length} of ${of} invoices created` : 'Invoice created'}</span>
        <h2>{many ? 'Send these payment links' : 'Send this payment link'}</h2>
        <BuyerVerdict key={created[0].res.hash} hash={created[0].res.hash} domain={setup.domain} forSeries={many} />
        {many && <p className="small muted">Separate invoices, one per month. Each is paid or scheduled on its own; nothing recurs by itself.</p>}
        {created.map(({ res, due, index }) => (
          <div key={res.hash} className="stack stack--sm">
            {many && <span className="label">Invoice {index + 1} of {of} · due {formatDue(due)}</span>}
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input input--mono grow" readOnly value={res.link} aria-label={many ? `Payment link, invoice ${index + 1}` : 'Payment link'} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn--primary" style={{ height: 48 }} onClick={() => void navigator.clipboard?.writeText(res.link).then(() => app.toast('Link copied'))}>
                <Icon name="copy" size={18} />Copy link
              </button>
            </div>
            <div className="btn-row">
              <Link className="btn btn--secondary" to={`/pay/${res.hash}`}>Open the payment page</Link>
            </div>
          </div>
        ))}
        {busy && <output className="small" style={{ display: 'block' }}>Follow your wallet: invoice {created.length + 1} of {of}…</output>}
        {error && <div className="notice notice--bad" role="alert"><Icon name="alert" /><p>{error}</p></div>}
        {!busy && <div className="btn-row"><button type="button" className="btn btn--secondary" onClick={reset}>Create another invoice</button></div>}
      </section>
    );
  }

  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  return (
    <form className="card stack stack--lg" onSubmit={submit} noValidate aria-labelledby="create-title">
      <div className="row row--between">
        <h2 id="create-title">New invoice</h2>
        <span className="small muted">From {setup.name || 'your business'} · <span className="mono">{setup.domain || 'no domain'}</span> · <Link className="link" to="/setup">Edit setup</Link></span>
      </div>
      {err('setup') && <div className="notice notice--warn" role="alert"><Icon name="alert" /><p>{errors.setup} <Link className="link" to="/setup">Open setup</Link></p></div>}

      <div className="field">
        <label htmlFor="ci-client">Client name</label>
        <input id="ci-client" className="input" value={client} onChange={(e) => setClient(e.target.value)} aria-invalid={!!err('client')} placeholder="Beta Labs" />
        {err('client') && <span className="field-error">{err('client')}</span>}
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>Line items</legend>
        {lines.map((l, i) => (
          <div key={i} className="line-row">
            <div className="field">
              <label htmlFor={`li-d-${i}`} className="sr-only">Description, line {i + 1}</label>
              <input id={`li-d-${i}`} className="input" value={l.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Brand identity" />
            </div>
            <div className="field">
              <label htmlFor={`li-q-${i}`} className="sr-only">Quantity, line {i + 1}</label>
              <input id={`li-q-${i}`} className="input" inputMode="numeric" value={l.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`li-p-${i}`} className="sr-only">Unit price in USDT, line {i + 1}</label>
              <input id={`li-p-${i}`} className="input" inputMode="decimal" value={l.price} onChange={(e) => updateLine(i, 'price', e.target.value)} placeholder="1250.00" />
            </div>
            <button type="button" className="icon-btn" style={{ width: 44, height: 48 }} aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <div className="row row--between">
          <button type="button" className="link" onClick={() => setLines([...lines, { description: '', quantity: '1', price: '' }])}><Icon name="plus" size={14} className="inline-icon" /> Add a line</button>
          <p aria-live="polite"><span className="muted small">Total </span><strong style={{ fontSize: 'var(--t-card)', fontWeight: 500 }}>{formatUsdt(total)} USDT</strong></p>
        </div>
        {err('lines') && <span className="field-error">{err('lines')}</span>}
      </fieldset>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="ci-due">Due date (UTC)</label>
          <input id="ci-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} disabled={demoOn} aria-invalid={!!err('due') && !demoOn} />
          {err('due') && !demoOn && <span className="field-error">{err('due')}</span>}
        </div>
        {example && (
          <div className="field">
            <label htmlFor="ci-demo-min">Demo: due in N minutes (optional)</label>
            <input id="ci-demo-min" className="input" inputMode="numeric" value={demoMinutes} onChange={(e) => setDemoMinutes(e.target.value)} placeholder="e.g. 2" aria-invalid={demoOn && !!err('due')} aria-describedby="ci-demo-min-h" />
            {demoOn && err('due')
              ? <span className="field-error">{err('due')}</span>
              : <span id="ci-demo-min-h" className="hint">{demoOn ? `Due ${minutesN} minute${minutesN === 1 ? '' : 's'} after you sign. Time-compressed for the demo; replaces the date.` : 'Time-compressed demo: replaces the date. Example data only.'}</span>}
          </div>
        )}
        <div className="field">
          <label htmlFor="ci-grace">Payable for (days after due)</label>
          <input id="ci-grace" className="input" inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} aria-invalid={!!err('grace')} aria-describedby="ci-grace-h" />
          {err('grace') ? <span className="field-error">{err('grace')}</span> : <span id="ci-grace-h" className="hint">After this the invoice expires and cannot be paid.</span>}
        </div>
        <div className="field">
          <label htmlFor="ci-series">Number of invoices (optional)</label>
          <input id="ci-series" className="input" inputMode="numeric" value={seriesCount} onChange={(e) => setSeriesCount(e.target.value)} disabled={demoOn} aria-invalid={!!err('series')} aria-describedby="ci-series-h" />
          {err('series')
            ? <span className="field-error">{err('series')}</span>
            : <span id="ci-series-h" className="hint">{seriesN && seriesN > 1 ? `Creates ${seriesN} separate invoices, one month apart, from the due date above. You sign each one; each is paid on its own. Nothing recurs by itself.` : 'Leave at 1 for a single invoice. A higher number creates separate monthly invoices; it is not a subscription.'}</span>}
        </div>
        <div className="field span-2">
          <label htmlFor="ci-payer">Only this wallet may pay (optional)</label>
          <input id="ci-payer" className="input input--mono" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="0x… (leave empty for any wallet)" aria-invalid={!!err('payer')} spellCheck={false} />
          {err('payer') && <span className="field-error">{err('payer')}</span>}
        </div>
        <div className="field span-2">
          <label htmlFor="ci-notes">Notes</label>
          <textarea id="ci-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={example} onChange={(e) => setExample(e.target.checked)} />
        <span>Mark as EXAMPLE DATA (shows a banner to the buyer). Leave on for demos.</span>
      </label>

      {error && <div className="notice notice--bad" role="alert"><Icon name="alert" /><p>{error}</p></div>}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={busy} aria-describedby="ci-sign-h">
          {busy ? 'Waiting for your wallet…' : `Sign and create invoice${total > 0n ? ` for ${formatUsdt(total)} USDT` : ''}`}
        </button>
      </div>
      <p id="ci-sign-h" className="small muted">
        Your wallet signs the invoice. Nothing is sent on chain and no gas is used.
      </p>
    </form>
  );
}
