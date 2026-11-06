import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Icon } from '../components/Icon';
import { AddressChip } from '../components/invoice/AddressChip';
import { CreateInvoiceForm } from '../components/merchant/CreateInvoiceForm';
import { CsvButton } from '../components/merchant/CsvButton';
import { InvoiceDrawer } from '../components/merchant/InvoiceDrawer';
import { InvoiceTable } from '../components/merchant/InvoiceTable';
import { api } from '../lib/api';
import type { Hex, InvoiceSummary, Status } from '../lib/api/types';
import { formatUsdt } from '../lib/format';
import { loadSetup } from '../lib/merchantSetup';

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
  const { wallet, connect } = useApp();
  const setup = loadSetup();
  const [rows, setRows] = useState<InvoiceSummary[]>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<Hex>();
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

  if (!address) {
    return (
      <div className="wrap app-main">
        <div className="dash-gate card">
          <span className="dash-gate__icon"><Icon name="wallet" size={26} /></span>
          <h1>Connect your signing wallet</h1>
          <p className="muted measure">Your invoices are listed by the wallet that signed them. New here? <Link className="link" to="/setup">Start with setup</Link>.</p>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => connect('merchant')} disabled={wallet.connecting}>{wallet.connecting ? 'Connecting…' : 'Connect wallet'}</button>
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
            <a href="#invoices"><Icon name="menu" size={16} />All invoices</a>
            <a href="#new"><Icon name="plus" size={16} />New invoice</a>
            <Link to="/setup"><Icon name="globe" size={16} />Domain setup</Link>
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

          <section id="overview" className="dash__overview" aria-labelledby="ov-title">
            <div className="dash__top">
              <div className="stack stack--sm">
                <div className="row row--between">
                  <h1 id="ov-title">Overview</h1>
                </div>
                <span className="dash__label">Total invoiced</span>
                {rows ? (
                  <div className="dash__total" aria-live="polite">{formatUsdt(totals.all)} <small>USDT</small></div>
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
                {address && <CsvButton address={address} disabled={!rows?.length} />}
              </div>
            </div>

            <div className="dash__cards">
              {totals.buckets.map((b) => (
                <div key={b.key} className="dash__card">
                  <span><i style={{ background: b.color }} />{b.label}</span>
                  {rows ? <strong>{formatUsdt(b.sum)} <small>USDT</small></strong> : <span className="skeleton" style={{ height: 24, width: '60%' }} />}
                  <em>{b.note}</em>
                </div>
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
            <div className="dash__listhead"><h2 id="list-title">Invoices</h2><a href="#new" className="link small">New invoice</a></div>
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
                <a href="#new" className="btn btn--primary"><Icon name="plus" size={18} />Create your first invoice</a>
              </div>
            ) : (
              <InvoiceTable rows={rows} selected={open} onOpen={setOpen} />
            )}
          </section>

          <section id="new" aria-label="New invoice">
            <CreateInvoiceForm onCreated={load} />
          </section>
        </div>
      </div>
      {open && <InvoiceDrawer hash={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
