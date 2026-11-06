import type { AuditEvent } from '../../lib/api/types';
import { formatIso } from '../../lib/format';
import { eventLabel } from '../../lib/messages';
import { AddressChip } from './AddressChip';

export function Timeline({ events }: { events?: AuditEvent[] }) {
  if (!events?.length) return <p className="muted small">No events recorded yet.</p>;
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <ol className="timeline">
      {sorted.map((e, i) => {
        const { label, tone } = eventLabel(e.type);
        return (
          <li key={i} data-tone={tone}>
            <div className="row row--between" style={{ gap: 'var(--s-2)' }}>
              <strong>{label}</strong>
              <time className="small muted" dateTime={e.at}>{formatIso(e.at)}</time>
            </div>
            {e.detail && <p className="small muted">{e.detail}</p>}
            {e.txHash && <AddressChip value={e.txHash} kind="tx" />}
          </li>
        );
      })}
    </ol>
  );
}
