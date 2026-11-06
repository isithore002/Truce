import { Icon, Logo } from '../../components/Icon';

/* Static product screens for the landing page. All figures are EXAMPLE DATA and say so. */

const SPARK = 'M0 62 L18 58 L34 60 L50 50 L66 52 L82 44 L98 46 L114 36 L130 40 L146 30 L162 34 L178 22 L194 26 L210 14 L226 18 L240 6';

const ROWS = [
  { d: 'Nov 04', t: 'INV-0042 · Beta Labs', s: 'Paid', amt: '+1,250.00', tone: 'ok' },
  { d: 'Nov 03', t: 'INV-0041 · Fernhill Cafe', s: 'Scheduled', amt: '480.00', tone: 'info' },
  { d: 'Nov 01', t: 'INV-0040 · Kestrel Print Co.', s: 'Issued', amt: '2,020.00', tone: 'neutral' },
] as const;

export function DashboardFrame() {
  return (
    <div className="frame" role="img" aria-label="Example Truce merchant dashboard: 3,750 USDT invoiced, 1,250 paid, 480 scheduled, 2,020 open. Example data.">
      <div className="frame__screen">
        <aside className="frame__side">
          <div className="frame__brand"><Logo /><span>Truce</span></div>
          <span className="frame__group">Invoices</span>
          <span className="frame__nav is-on"><Icon name="file" size={15} />Overview</span>
          <span className="frame__nav"><Icon name="plus" size={15} />New invoice</span>
          <span className="frame__nav"><Icon name="shield" size={15} />Verify</span>
          <span className="frame__group">Wallets</span>
          <span className="frame__acct"><i style={{ background: 'var(--chart-a)' }} />Signing<em>0x7a1e…e1f2</em></span>
          <span className="frame__acct"><i style={{ background: 'var(--chart-b)' }} />Payout<em>0x3b9c…9b0c</em></span>
          <span className="frame__acct"><i style={{ background: 'var(--chart-c)' }} />Domain<em>northlight…</em></span>
        </aside>
        <div className="frame__main">
          <div className="frame__crumb">
            <span>Invoices / <strong>Northlight Design Studio</strong></span>
            <span className="frame__pill">EXAMPLE DATA</span>
          </div>
          <div className="frame__top">
            <div>
              <h3>Overview</h3>
              <span className="frame__label">Invoiced this month</span>
              <div className="frame__total">3,750.00 <small>USDT</small></div>
              <span className="frame__delta">1 of 3 paid</span>
            </div>
            <svg className="frame__spark" viewBox="0 0 240 70" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--p-gold)" stopOpacity=".28" />
                  <stop offset="1" stopColor="var(--p-gold)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${SPARK} L240 70 L0 70 Z`} fill="url(#spark-fill)" />
              <path d={SPARK} fill="none" stroke="var(--p-gold)" strokeWidth="2" />
            </svg>
          </div>
          <div className="frame__cards">
            <div><span><i style={{ background: 'var(--chart-a)' }} />Paid</span><strong>1,250.00</strong><em>Settled to the signed payout</em></div>
            <div><span><i style={{ background: 'var(--chart-b)' }} />Scheduled</span><strong>480.00</strong><em>Collects on the due date</em></div>
            <div><span><i style={{ background: 'var(--chart-c)' }} />Open</span><strong>2,020.00</strong><em>Waiting for the buyer</em></div>
          </div>
          <div className="frame__list">
            <div className="frame__listhead"><strong>Recent activity</strong><span>View all</span></div>
            {ROWS.map((r) => (
              <div key={r.t} className="frame__row">
                <span>{r.d}</span><span>{r.t}</span><span className={`frame__st frame__st--${r.tone}`}>{r.s}</span><span className={r.tone === 'ok' ? 'is-ok' : undefined}>{r.amt}</span>
              </div>
            ))}
          </div>
          <div className="frame__bar">
            <strong>Status breakdown</strong>
            <div className="frame__stack"><i style={{ flex: 33 }} /><i style={{ flex: 13 }} /><i style={{ flex: 54 }} /></div>
            <div className="frame__legend"><span><i style={{ background: 'var(--chart-a)' }} />33% Paid</span><span><i style={{ background: 'var(--chart-b)' }} />13% Scheduled</span><span><i style={{ background: 'var(--chart-c)' }} />54% Open</span></div>
          </div>
        </div>
      </div>
      <div className="frame__float">
        <div className="frame__floathead"><span className="badge badge--ok"><Icon name="check" />PASS</span>Payment to <strong>Northlight</strong></div>
        <div className="frame__flow">
          <span><i style={{ background: 'var(--chart-c)' }} />Beta Labs</span>
          <span className="frame__dash" />
          <span><i style={{ background: 'var(--chart-b)' }} />0x3b9c…9b0c</span>
        </div>
        <div className="frame__floatamt">1,250.00 USDT</div>
      </div>
    </div>
  );
}

export function PhoneMock({ step }: { step: 'file' | 'pay' | 'paid' }) {
  return (
    <div className="phone">
      <div className="phone__notch" />
      <div className="phone__time">9:41</div>
      {step === 'file' && (
        <div className="phone__body">
          <span className="phone__label">/.well-known/truce.json</span>
          <pre className="phone__code">{`{
  "version": 1,
  "name": "Northlight
    Design Studio",
  "signingAddress":
    "0x7a1e…e1f2",
  "payoutAddresses": [
    "0x3b9c…9b0c"
  ],
  "chainIds": [1874]
}`}</pre>
        </div>
      )}
      {step === 'pay' && (
        <div className="phone__body">
          <span className="phone__label">Invoice INV-0042</span>
          <div className="phone__amt">1,250 <small>USDT</small></div>
          <div className="phone__card"><span className="phone__pass"><Icon name="check" size={14} />PASS</span><small>10 of 10 checks</small></div>
          <div className="phone__card"><small>Pays to</small><strong>0x3b9c…9b0c</strong><small>listed by northlight-design.example</small></div>
          <span className="phone__btn">Pay 1,250 USDT</span>
        </div>
      )}
      {step === 'paid' && (
        <div className="phone__body">
          <span className="phone__label">Receipt</span>
          <div className="phone__amt">Paid</div>
          <svg className="phone__spark" viewBox="0 0 240 70" preserveAspectRatio="none" aria-hidden="true"><path d={SPARK} fill="none" stroke="var(--p-gold)" strokeWidth="2.5" /></svg>
          <div className="phone__card"><small>Settled by InvoiceSettler</small><strong>1,250.00 USDT</strong><small>tx 0x9f2c…41ab · explorer</small></div>
          <span className="phone__btn phone__btn--ghost">View on explorer</span>
        </div>
      )}
      <span className="phone__example">EXAMPLE DATA</span>
    </div>
  );
}
