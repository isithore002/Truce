import type { Check } from '../../lib/api/types';
import { CHECK_IDS } from '../../lib/api/types';
import { checkMessage } from '../../lib/messages';
import { Icon } from '../Icon';

/** The ten checks in a fixed order, in plain words. Failing rows come first and are highlighted. */
export function VerificationChecklist({ checks, domain, loading }: { checks?: Check[]; domain: string; loading?: boolean }) {
  if (loading || !checks) {
    return (
      <div className="card card--flush" aria-hidden="true">
        {CHECK_IDS.map((id) => (
          <div key={id} style={{ display: 'flex', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--p-line)' }}>
            <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 99 }} />
            <div className="skeleton" style={{ height: 16, flex: 1, marginTop: 4 }} />
          </div>
        ))}
      </div>
    );
  }
  const order = (id: string) => CHECK_IDS.indexOf(id as (typeof CHECK_IDS)[number]);
  const sorted = [...checks].sort((a, b) => Number(a.ok) - Number(b.ok) || order(a.id) - order(b.id));
  const passed = checks.filter((c) => c.ok).length;
  return (
    <section className="card card--flush" aria-labelledby="checks-title">
      <div className="card__head">
        <h3 id="checks-title">Checks</h3>
        <span className="small muted">{passed} of {checks.length} passed</span>
      </div>
      <ul className="checklist">
        {sorted.map((c) => {
          const m = checkMessage(c.id, c.ok, { domain });
          return (
            <li key={c.id} data-ok={c.ok} data-check={c.id}>
              <span className="checklist__icon"><Icon name={c.ok ? 'check' : 'x'} /></span>
              <div>
                <strong>
                  {m.title}
                  <span className="checklist__state">{c.ok ? 'PASS' : 'FAIL'}</span>
                </strong>
                <p>{m.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
