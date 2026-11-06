import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Icon } from '../components/Icon';
import { AddressChip } from '../components/invoice/AddressChip';
import { CreateInvoiceForm } from '../components/merchant/CreateInvoiceForm';
import { Sheet } from '../components/Sheet';
import { CsvButton } from '../components/merchant/CsvButton';
import { InvoiceDrawer } from '../components/merchant/InvoiceDrawer';
import { InvoiceTable } from '../components/merchant/InvoiceTable';
import { api } from '../lib/api';
import type { Hex, InvoiceSummary, Status } from '../lib/api/types';
import { formatUsdt, isAddress } from '../lib/format';
import { loadSetup } from '../lib/merchantSetup';
import { useAnimatedNumber } from '../lib/motion';

type Filter = 'all' | 'open' | 'scheduled' | 'paid' | 'attention';

const FILTERS: Record<Filter, (s: Status) => boolean> = {
  all: () => true,
  open: (s) => s === 'ISSUED',
  scheduled: (s) => s === 'SCHEDULED_OK' || s === 'AT_RISK' || s === 'FAILED',
  paid: (s) => s === 'PAID',
  attention: (s) => s === 'AT_RISK' || s === 'FAILED',
};
const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'paid', label: 'Paid' }, { key: 'attention', label: 'Needs attention' },
];

type Bucket = { key: string; label: string; note: string; color: string; match: (s: Status) => boolean };

const BUCKETS: Bucket[] = [
  { key: 'paid', label: 'Paid', note: 'Settled to your signed payout wallet', color: 'var(--chart-a)', match: (s) => s === 'PAID' },
  { key: 'scheduled', label: 'Scheduled', note: 'Signed by the buyer for the due date', color: 'var(--chart-b)', match: (s) => s === 'SCHEDULED_OK' || s === 'AT_RISK' || s === 'FAILED' },
  { key: 'open', label: 'Open', note: 'Sent, waiting for the buyer', color: 'var(--chart-c)', match: (s) => s === 'ISSUED' },
];

/** Cumulative invoiced amount in list order: a real series for the sparkline, not decoration. */
function sparkPath(rows: InvoiceSummary[]): string | undefined {
  if (rows.length < 2) return undefined;
  const ordered = [...rows].sort((a, b) => Number(a.dueDate) - Number(b.dueDate));
  let acc = 0n;
  const pts = ordered.map((r) => (acc += BigInt(r.amount)));
  const max = Number(pts[pts.length - 1]) || 1;
  return pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * 240).toFixed(1)} ${(64 - (Number(v) / max) * 58).toFixed(1)}`).join(' ');
}

export function MerchantPage() {
  const { wallet, connect, toast } = useApp();
  const setup = loadSetup();
  const [rows, setRows] = useState<InvoiceSummary[]>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<Hex>();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const closeCreate = useCallback(() => setCreating(false), []);
  const address = wallet.address;

  const load = useCallback(() => {
    if (!address) return;
    api.listMerchantInvoices(address).then((r) => { setRows(r); setError(undefined); }, (e: Error) => setError(e.message));
  }, [address]);
  useEffect(() => load(), [load]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    const live = list.filter((r) => r.status !== 'CANCELLED' && r.status !== 'EXPIRED');
    const all = live.reduce((a, r) => a + BigInt(r.amount), 0n);
    const buckets = BUCKETS.map((b) => {
      const sum = live.filter((r) => b.match(r.status)).reduce((a, r) => a + BigInt(r.amount), 0n);
      return { ...b, sum, pct: all > 0n ? Number((sum * 1000n) / all) / 10 : 0 };
    });
    return { all, buckets, paidCount: list.filter((r) => r.status === 'PAID').length, count: list.length, attention: list.filter((r) => r.status === 'AT_RISK' || r.status === 'FAILED').length, example: list.some((r) => r.example) };
  }, [rows]);
  const spark = useMemo(() => sparkPath(rows ?? []), [rows]);
  // base units fit a JS number exactly up to 9e15 (9 billion USDT); the label always carries the exact bigint value
  const shownTotal = useAnimatedNumber(Number(totals.all));

  const counts = {
    all: (rows ?? []).length,
    open: (rows ?? []).filter((r) => FILTERS.open(r.status)).length,
    scheduled: (rows ?? []).filter((r) => FILTERS.scheduled(r.status)).length,
    paid: (rows ?? []).filter((r) => FILTERS.paid(r.status)).length,
    attention: (rows ?? []).filter((r) => FILTERS.attention(r.status)).length,
  };
  const q = query.trim().toLowerCase();
  const visible = (rows ?? []).filter((r) => FILTERS[filter](r.status) && (!q || r.clientName.toLowerCase().includes(q) || r.hash.includes(q) || r.invoiceId.includes(q)));
  const setupMissing = !setup.domain || !isAddress(setup.payout);
  const latest = rows?.[0];

  if (!address) {
    return (
      <div className="wrap app-main">
        <div className="dash-gate card">
          <span className="dash-gate__icon"><Icon name="wallet" size={26} /></span>
          <h1>Connect your signing wallet</h1>
          <p className="muted measure">Your invoices are listed by the wallet that signed them. New here? <Link className="link" to="/setup">Start with setup</Link>.</p>
          <ul className="dash-gate__list">
            <li><Icon name="check" size={16} />See every invoice, its status and the transaction</li>
            <li><Icon name="check" size={16} />Create and sign new invoices; no gas, nothing sent on chain</li>
            <li><Icon name="check" size={16} />Download a CSV for your accounts</li>
          </ul>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => void connect('merchant').then((a) => a && toast('Wallet connected. Your invoices are below.'))} disabled={wallet.connecting}>
            <Icon name="wallet" size={18} />{wallet.connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
          <p className="small muted">Connecting only reads your address. Your key stays in your wallet, and every signature asks you first.</p>
          {wallet.error && <p className="field-error" role="alert">{wallet.error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap app-main">
      <div className="dash">
        <aside className="dash__side" aria-label="Merchant">
          <div className="dash__who">
            <strong>{setup.name || 'Your business'}</strong>
            <span>{setup.domain || 'No domain set'}</span>
          </div>
          <span className="dash__group">Invoices</span>
          <nav className="dash__nav" aria-label="Dashboard sections">
            <a href="#overview" className="is-on"><Icon name="file" size={16} />Overview</a>
            <a href="#invoices"><Icon name="menu" size={16} />All invoices<em>{counts.all}</em></a>
            <button type="button" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New invoice</button>
            <Link to="/setup"><Icon name="globe" size={16} />Domain setup{setupMissing && <em className="is-warn">1</em>}</Link>
            <Link to="/verify"><Icon name="shield" size={16} />Verify a link</Link>
          </nav>
          <span className="dash__group">Wallets</span>
          <dl className="dash__wallets">
            <div><dt><i style={{ background: 'var(--chart-a)' }} />Signing</dt><dd><AddressChip value={address} /></dd></div>
            <div><dt><i style={{ background: 'var(--chart-b)' }} />Payout</dt><dd>{setup.payout ? <AddressChip value={setup.payout} /> : <span className="muted small">Not set</span>}</dd></div>
          </dl>
        </aside>

        <div className="dash__main">
          <div className="dash__crumb">
            <span>Invoices / <strong>{setup.name || 'Merchant'}</strong></span>
            {totals.example && <span className="dash__pill">EXAMPLE DATA</span>}
          </div>

          <div className="dash__welcome">
            <div>
              <span className="dash__label">Welcome back</span>
              <h1 id="ov-title">{setup.name || 'Your invoices'}</h1>
            </div>
            <div className="dash__actions">
              <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />New invoice</button>
              {latest && (
                <button type="button" className="btn btn--secondary" onClick={() => void navigator.clipboard?.writeText(`${location.origin}/pay/${latest.hash}`).then(() => toast(`Link for ${latest.clientName} copied`))}>
                  <Icon name="copy" size={18} />Copy latest link
                </button>
              )}
              <CsvButton address={address} disabled={!rows?.length} />
            </div>
          </div>

          {setupMissing && (
            <div className="dash__setup" role="status">
              <span className="dash__setup-icon" aria-hidden="true"><Icon name="globe" size={18} /></span>
              <div>
                <strong>Finish setup so buyers see PASS</strong>
                <span>Name your domain and payout wallet, then publish truce.json on that domain.</span>
              </div>
              <Link className="btn btn--secondary" to="/setup">Finish setup<Icon name="arrow" className="arrow" /></Link>
            </div>
          )}

          <section id="overview" className="dash__overview" aria-labelledby="ov-title">
            <div className="dash__top">
              <div className="stack stack--sm">
                <span className="dash__label">Total invoiced</span>
                {rows ? (
                  <div className="dash__total" aria-label={`${formatUsdt(totals.all)} USDT`}><span aria-hidden="true">{formatUsdt(BigInt(Math.round(shownTotal)))} <small>USDT</small></span></div>
                ) : <span className="skeleton" style={{ height: 52, width: 260 }} />}
                {rows && <span className="dash__delta">{totals.paidCount} of {totals.count} paid{totals.attention ? ` · ${totals.attention} need attention` : ''}</span>}
              </div>
              <div className="dash__spark">
                {spark ? (
                  <svg viewBox="0 0 240 70" preserveAspectRatio="none" role="img" aria-label="Cumulative amount invoiced, by due date">
                    <defs>
                      <linearGradient id="dash-spark" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="var(--p-gold)" stopOpacity=".28" />
                        <stop offset="1" stopColor="var(--p-gold)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${spark} L240 70 L0 70 Z`} fill="url(#dash-spark)" />
                    <path d={spark} fill="none" stroke="var(--p-gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : null}
              </div>
            </div>

            <div className="dash__cards">
              {totals.buckets.map((b) => (
                <button key={b.key} type="button" className={`dash__card${filter === b.key ? ' is-on' : ''}`} aria-pressed={filter === b.key}
                  onClick={() => { setFilter(b.key as Filter); document.getElementById('invoices')?.scrollIntoView({ block: 'start' }); }}>
                  <span><i style={{ background: b.color }} />{b.label}</span>
                  {rows ? <strong>{formatUsdt(b.sum)} <small>USDT</small></strong> : <span className="skeleton" style={{ height: 24, width: '60%' }} />}
                  <em>{b.note}</em>
                </button>
              ))}
            </div>

            {rows && totals.all > 0n && (
              <div className="dash__bar">
                <strong>Status breakdown</strong>
                <div className="dash__stack" aria-hidden="true">
                  {totals.buckets.filter((b) => b.sum > 0n).map((b) => <i key={b.key} style={{ flex: b.pct, background: b.color }} />)}
                </div>
                <ul className="dash__legend">
                  {totals.buckets.map((b) => <li key={b.key}><i style={{ background: b.color }} />{b.pct.toFixed(0)}% {b.label}</li>)}
                </ul>
              </div>
            )}
          </section>

          <section id="invoices" className="stack" aria-labelledby="list-title">
            <div className="dash__listhead">
              <h2 id="list-title">Invoices</h2>
              <label className="dash__search">
                <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                <span className="sr-only">Search invoices</span>
                <input type="search" placeholder="Search client or hash" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
            <div className="dash__tabs" role="group" aria-label="Filter invoices">
              {TABS.map((t) => (
                <button key={t.key} type="button" aria-pressed={filter === t.key} className={t.key === 'attention' && counts.attention ? 'is-warn' : undefined} onClick={() => setFilter(t.key)}>
                  {t.label}<em>{counts[t.key]}</em>
                </button>
              ))}
            </div>
            {error ? (
              <div className="state" role="alert">
                <h2>Could not load invoices</h2>
                <p className="muted">{error}</p>
                <button type="button" className="btn btn--secondary" onClick={load}><Icon name="refresh" size={18} />Try again</button>
              </div>
            ) : !rows ? (
              <div className="stack" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>
            ) : rows.length === 0 ? (
              <div className="state">
                <h2>No invoices yet</h2>
                <p className="muted">Invoices you sign with this wallet show up here with their status.</p>
                <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />Create your first invoice</button>
              </div>
            ) : visible.length === 0 ? (
              <div className="state">
                <h2>Nothing matches</h2>
                <p className="muted">No matching invoices{q ? ` for "${query.trim()}"` : ''} in this view.</p>
                <button type="button" className="btn btn--secondary" onClick={() => { setFilter('all'); setQuery(''); }}>Show all invoices</button>
              </div>
            ) : (
              <InvoiceTable rows={visible} selected={open} onOpen={setOpen} />
            )}
          </section>
        </div>
      </div>
      {open && <InvoiceDrawer hash={open} onClose={() => setOpen(undefined)} />}
      {creating && (
        <Sheet title="Create and sign an invoice" onClose={closeCreate} wide>
          <CreateInvoiceForm onCreated={load} />
        </Sheet>
      )}
    </div>
  );
}
