import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Icon } from '../components/Icon';
import { CreateInvoiceForm } from '../components/merchant/CreateInvoiceForm';
import { CsvButton } from '../components/merchant/CsvButton';
import { InvoiceDrawer } from '../components/merchant/InvoiceDrawer';
import { InvoiceTable } from '../components/merchant/InvoiceTable';
import { api } from '../lib/api';
import type { Hex, InvoiceSummary } from '../lib/api/types';
import { formatUsdt } from '../lib/format';

export function MerchantPage() {
  const { wallet, connect } = useApp();
  const [rows, setRows] = useState<InvoiceSummary[]>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<Hex>();
  const address = wallet.address;

  const load = useCallback(() => {
    if (!address) return;
    api.listMerchantInvoices(address).then((r) => { setRows(r); setError(undefined); }, (e: Error) => setError(e.message));
  }, [address]);
  useEffect(() => load(), [load]);

  const sum = (f: (r: InvoiceSummary) => boolean) => (rows ?? []).filter(f).reduce((a, r) => a + BigInt(r.amount), 0n);
  const stats = [
    { label: 'Open', value: `${formatUsdt(sum((r) => r.status === 'ISSUED'))} USDT` },
    { label: 'Paid', value: `${formatUsdt(sum((r) => r.status === 'PAID'))} USDT` },
    { label: 'Scheduled', value: String((rows ?? []).filter((r) => r.status === 'SCHEDULED_OK').length) },
    { label: 'Needs attention', value: String((rows ?? []).filter((r) => r.status === 'AT_RISK' || r.status === 'FAILED').length) },
  ];

  return (
    <div className="wrap app-main stack stack--lg">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <span className="label">Merchant</span>
        <div className="row row--between">
          <h1>Invoices</h1>
          {address && <CsvButton address={address} disabled={!rows?.length} />}
        </div>
        <p className="lead muted measure">Create signed invoices, send the link, and follow each payment to the explorer.</p>
      </header>

      {!address ? (
        <div className="state">
          <Icon name="wallet" size={28} />
          <h2>Connect your signing wallet</h2>
          <p className="muted measure">Your invoices are listed by the wallet that signed them. New here? <Link className="link" to="/setup">Start with setup</Link>.</p>
          <button type="button" className="btn btn--primary" onClick={() => connect('merchant')} disabled={wallet.connecting}>{wallet.connecting ? 'Connecting…' : 'Connect wallet'}</button>
          {wallet.error && <p className="field-error" role="alert">{wallet.error}</p>}
        </div>
      ) : (
        <>
          <div className="stat-row" aria-label="Summary">
            {stats.map((s) => (
              <div key={s.label} className="card">
                <span className="label">{s.label}</span>
                {rows ? <strong>{s.value}</strong> : <span className="skeleton" style={{ height: 34, width: '70%' }} />}
              </div>
            ))}
          </div>
          <div className="split">
            <section className="stack" aria-labelledby="list-title">
              <h2 id="list-title" className="sr-only">Invoice list</h2>
              {error ? (
                <div className="state" role="alert">
                  <h2>Could not load invoices</h2>
                  <p className="muted">{error}</p>
                  <button type="button" className="btn btn--secondary" onClick={load}><Icon name="refresh" size={18} />Try again</button>
                </div>
              ) : !rows ? (
                <div className="card stack" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}</div>
              ) : rows.length === 0 ? (
                <div className="state">
                  <h2>No invoices yet</h2>
                  <p className="muted">Invoices you sign with this wallet show up here with their status.</p>
                </div>
              ) : (
                <InvoiceTable rows={rows} selected={open} onOpen={setOpen} />
              )}
            </section>
            <CreateInvoiceForm onCreated={load} />
          </div>
        </>
      )}
      {open && <InvoiceDrawer hash={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
