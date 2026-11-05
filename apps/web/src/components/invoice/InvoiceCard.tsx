import type { InvoiceDoc, Overlay, Status } from '../../lib/api/types';
import { ZERO_ADDRESS } from '../../lib/api/types';
import { config } from '../../lib/config';
import { formatDateLocal, formatDay, relativeTime, sameAddress } from '../../lib/format';
import { Icon } from '../Icon';
import { AddressChip } from './AddressChip';
import { AmountUsdt } from './AmountUsdt';
import { LineItems } from './LineItems';
import { StatusBadge } from './StatusBadge';

/** The invoice as the buyer sees it. The payout wallet and the domain sit next to the amount. */
export function InvoiceCard({ doc, status, overlay }: { doc: InvoiceDoc; status?: Status; overlay?: Overlay }) {
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
        <div className="inv-amount">
          <div className="stack stack--sm">
            <span className="label">Amount due</span>
            <AmountUsdt value={inv.amount} size="lg" />
            {config.features.soulBadge && (
              <span className="badge badge--info" style={{ alignSelf: 'flex-start' }}>
                <Icon name="shield" />
                Individual KYC-verified on WhiteBIT (demo data, mocked)
              </span>
            )}
          </div>
          <dl className="kv">
            <dt>Pays to</dt>
            <dd><AddressChip value={inv.payout} /></dd>
            <dt>Domain</dt>
            <dd className="mono small">{doc.domain}</dd>
            <dt>Signed by</dt>
            <dd><AddressChip value={inv.merchant} /></dd>
          </dl>
        </div>

        <dl className="kv">
          <dt>Billed to</dt>
          <dd>{details.clientName}</dd>
          <dt>Due date</dt>
          <dd>
            {formatDay(inv.dueDate)} <span className="muted small">({relativeTime(inv.dueDate)})</span>
            <div className="small muted">Your time: {formatDateLocal(inv.dueDate)}</div>
          </dd>
          <dt>Payable until</dt>
          <dd>{formatDay(inv.expiry)} <span className="muted small">({relativeTime(inv.expiry)})</span></dd>
          <dt>Who can pay</dt>
          <dd>{locked ? <AddressChip value={inv.payer} label="Only" /> : 'Any wallet'}</dd>
          {details.notes && (
            <>
              <dt>Notes</dt>
              <dd>{details.notes}</dd>
            </>
          )}
          <dt>Invoice id</dt>
          <dd><AddressChip value={inv.invoiceId} kind="hash" explorer={false} /></dd>
        </dl>

        <LineItems items={details.lineItems} signedAmount={inv.amount} />
      </div>
    </article>
  );
}
