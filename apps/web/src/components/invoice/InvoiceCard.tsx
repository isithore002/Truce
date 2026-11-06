import type { InvoiceDoc, Overlay, Status } from '../../lib/api/types';
import { ZERO_ADDRESS } from '../../lib/api/types';
import { config } from '../../lib/config';
import { formatDateLocal, formatDue, relativeTime, sameAddress } from '../../lib/format';
import { Icon } from '../Icon';
import { AddressChip } from './AddressChip';
import { AmountUsdt } from './AmountUsdt';
import { LineItems } from './LineItems';
import { StatusBadge } from './StatusBadge';

/** The invoice as the buyer sees it. The payout wallet and the domain sit next to the amount. */
export function InvoiceCard({ doc, status, overlay, payoutBad, signerBad }: { doc: InvoiceDoc; status?: Status; overlay?: Overlay; payoutBad?: boolean; signerBad?: boolean }) {
  const { invoice: inv, details } = doc;
  const locked = !sameAddress(inv.payer, ZERO_ADDRESS);
  return (
    <article className="card card--flush" aria-labelledby="inv-title">
      <div className="card__head">
        <div className="stack stack--sm" style={{ gap: 2 }}>
          <span className="label">Invoice from</span>
          <h2 id="inv-title" style={{ fontSize: 'var(--t-h3)' }}>{details.merchantName}</h2>
          <span className="row small" style={{ gap: 6 }}>
            <Icon name="globe" size={14} />
            <span className="mono">{doc.domain}</span>
          </span>
        </div>
        {status && <StatusBadge status={status} overlay={overlay} />}
      </div>

      <div className="card__body stack stack--lg">
        <div className="inv-amount" data-field="amount">
          <div className="stack stack--sm">
            <span className="label">Amount due</span>
            <AmountUsdt value={inv.amount} size="lg" />
            {config.features.soulBadge && doc.details.example && (
              <span className="badge badge--info" style={{ alignSelf: 'flex-start' }}>
                <Icon name="shield" />
                Individual KYC-verified on WhiteBIT (demo data, mocked)
              </span>
            )}
          </div>
          <dl className="kv">
            <dt data-field="payout">Pays to</dt>
            <dd data-field="payout" className={payoutBad ? 'kv-bad' : undefined}><AddressChip value={inv.payout} />{payoutBad && <span className="field-error">Not listed on {doc.domain}</span>}</dd>
            <dt data-field="domain">Domain</dt>
            <dd data-field="domain" className="mono small">{doc.domain}</dd>
            <dt data-field="signer">Signed by</dt>
            <dd data-field="signer" className={signerBad ? 'kv-bad' : undefined}><AddressChip value={inv.merchant} />{signerBad && <span className="field-error">Not the signer listed on {doc.domain}</span>}</dd>
          </dl>
        </div>

        <dl className="kv">
          <dt>Billed to</dt>
          <dd>{details.clientName}</dd>
          <dt>Due date</dt>
          <dd>
            {formatDue(inv.dueDate)} <span className="muted small">({relativeTime(inv.dueDate)})</span>
            <div className="small muted">Your time: {formatDateLocal(inv.dueDate)}</div>
          </dd>
          <dt data-field="expiry">Payable until</dt>
          <dd data-field="expiry">{formatDue(inv.expiry)} <span className="muted small">({relativeTime(inv.expiry)})</span></dd>
          <dt data-field="payer">Who can pay</dt>
          <dd data-field="payer">{locked ? <AddressChip value={inv.payer} label="Only" /> : 'Any wallet'}</dd>
          {details.notes && (
            <>
              <dt>Notes</dt>
              <dd>{details.notes}</dd>
            </>
          )}
          <dt>Invoice id</dt>
          <dd><AddressChip value={inv.invoiceId} kind="hash" explorer={false} /></dd>
        </dl>

        <div data-field="lines"><LineItems items={details.lineItems} signedAmount={inv.amount} /></div>
      </div>
    </article>
  );
}
