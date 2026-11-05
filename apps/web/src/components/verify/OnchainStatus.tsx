import type { InvoiceRecord } from '../../lib/api/types';
import { formatIso } from '../../lib/format';
import { HEALTH_MESSAGES, SNAPSHOT_NOTE, STATUS_BADGES } from '../../lib/messages';
import { AddressChip } from '../invoice/AddressChip';
import { StatusBadge } from '../invoice/StatusBadge';
import { Timeline } from '../invoice/Timeline';

export function OnchainStatus({ record, stored }: { record?: InvoiceRecord; stored: boolean }) {
  if (!stored) {
    return (
      <section className="card stack" aria-labelledby="status-title">
        <h3 id="status-title">Payment status</h3>
        <p className="small muted">This copy came inside the link and was checked without being stored, so there is no payment record to show.</p>
      </section>
    );
  }
  if (!record) return null;
  const scheduled = record.status === 'SCHEDULED_OK' || record.status === 'AT_RISK' || record.status === 'FAILED';
  return (
    <section className="card stack" aria-labelledby="status-title" aria-live="polite">
      <div className="row row--between">
        <h3 id="status-title">Payment status</h3>
        <StatusBadge status={record.status} overlay={record.overlay} />
      </div>
      <p className="small">{STATUS_BADGES[record.status]?.text}</p>
      {(record.tx || (scheduled && record.health)) && (
        <dl className="kv">
          {record.tx?.payer && (<><dt>Paid by</dt><dd><AddressChip value={record.tx.payer} /></dd></>)}
          {record.tx && (<><dt>Transaction</dt><dd><AddressChip value={record.tx.txHash} kind="tx" /></dd></>)}
          {record.tx?.paidAt && (<><dt>Paid at</dt><dd>{formatIso(record.tx.paidAt)}</dd></>)}
          {scheduled && record.health && (
            <>
              <dt>Last check</dt>
              <dd>
                {HEALTH_MESSAGES[record.health.reason]}
                {record.health.checkedAt && <div className="small muted">{formatIso(record.health.checkedAt)}</div>}
              </dd>
            </>
          )}
        </dl>
      )}
      {scheduled && <p className="small muted">{SNAPSHOT_NOTE}</p>}
      <div className="stack stack--sm">
        <span className="label">History</span>
        <Timeline events={record.events} />
      </div>
    </section>
  );
}
