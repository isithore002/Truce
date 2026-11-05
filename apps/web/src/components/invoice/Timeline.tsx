import type { AuditEvent } from '../../lib/api/types';
import { formatIso } from '../../lib/format';
import { AddressChip } from './AddressChip';

const LABEL: Record<AuditEvent['type'], string> = {
  created: 'Invoice created', verified: 'Checked', authorized: 'Buyer signed', scheduled: 'Scheduled', at_risk: 'At risk',
  failed: 'Collection failed', paid: 'Paid', cancelled: 'Cancelled', expired: 'Expired', refunded: 'Refunded',
};
const TONE: Partial<Record<AuditEvent['type'], string>> = { paid: 'ok', failed: 'bad', at_risk: 'warn', scheduled: 'info' };

export function Timeline({ events }: { events?: AuditEvent[] }) {
  if (!events?.length) return <p className="muted small">No events recorded yet.</p>;
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <ol className="timeline">
      {sorted.map((e, i) => (
        <li key={i} data-tone={TONE[e.type]}>
          <div className="row row--between" style={{ gap: 'var(--s-2)' }}>
            <strong>{LABEL[e.type] ?? e.type}</strong>
            <time className="small muted" dateTime={e.at}>{formatIso(e.at)}</time>
          </div>
          {e.detail && <p className="small">{e.detail}</p>}
          {e.txHash && <AddressChip value={e.txHash} kind="tx" />}
        </li>
      ))}
    </ol>
  );
}
