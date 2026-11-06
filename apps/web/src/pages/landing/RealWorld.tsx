import { Icon } from '../../components/Icon';
import { REAL_WORLD, REAL_WORLD_CHECKED_ON, REAL_WORLD_SCOPE } from '../../lib/realWorld';

/**
 * "Reported in the real world": three sourced reports with working links to the originals. The figures are the sources',
 * not ours, and the section says what Truce does and does not do about them (CLAUDE.md rule 5: no over-claims).
 */
export function RealWorld() {
  return (
    <section className="l-real" aria-labelledby="real-h" data-testid="real-world">
      <div className="wrap">
        <div className="l-sec-head" data-reveal>
          <span className="l-eyebrow"><i aria-hidden="true" />Reported in the real world</span>
          <h2 id="real-h">Paying the wrong wallet is a documented, costly mistake.</h2>
          <p>
            Three reports on invoice and payment-redirection fraud, with links to the originals. The figures are the publishers' own; we have not
            verified them independently. Read from the sources on {REAL_WORLD_CHECKED_ON}.
          </p>
        </div>

        <ul className="l-real__grid">
          {REAL_WORLD.map((r, i) => (
            <li key={r.id} className="l-real__card" data-reveal data-reveal-delay={i * 100}>
              <p className="l-real__figure">{r.figure}</p>
              <p className="l-real__label">{r.figureLabel}</p>
              <p className="l-real__body">{r.body}</p>
              <p className="l-real__caveat small muted">{r.caveat}</p>
              <a className="l-real__link" href={r.url} target="_blank" rel="noopener noreferrer">
                <span>{r.sourceName}</span>
                <small>{r.sourceKind}</small>
                <Icon name="external" size={16} />
                <span className="sr-only"> (opens the source in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="l-real__scope" data-reveal>
          <p><strong>What Truce does about it.</strong> {REAL_WORLD_SCOPE.does}</p>
          <p><strong>What it does not do.</strong> {REAL_WORLD_SCOPE.doesNot}</p>
        </div>
      </div>
    </section>
  );
}
