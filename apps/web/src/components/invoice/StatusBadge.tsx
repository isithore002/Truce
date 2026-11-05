import type { Overlay, Status } from '../../lib/api/types';
import { OVERLAY_BADGES, STATUS_BADGES, type Tone } from '../../lib/messages';
import { Icon, type IconName } from '../Icon';

const TONE_ICON: Record<Tone, IconName> = { ok: 'check', bad: 'x', warn: 'alert', info: 'clock', neutral: 'file' };

export function StatusBadge({ status, overlay }: { status: Status; overlay?: Overlay }) {
  const b = STATUS_BADGES[status] ?? { label: status, tone: 'neutral' as Tone };
  const o = overlay ? OVERLAY_BADGES[overlay] : undefined;
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <span className={`badge${b.tone === 'neutral' ? '' : ` badge--${b.tone}`}`}>
        <Icon name={TONE_ICON[b.tone]} />
        {b.label}
      </span>
      {o && <span className={`badge badge--${o.tone}`}>{o.label}</span>}
    </span>
  );
}
