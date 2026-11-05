import type { VerifyResponse } from '../../lib/api/types';
import { Icon } from '../Icon';

export function VerdictBanner({ verify, domain, loading }: { verify?: VerifyResponse; domain?: string; loading?: boolean }) {
  if (loading || !verify) {
    return (
      <section className="verdict verdict--loading" aria-busy="true" aria-live="polite">
        <div className="verdict__icon skeleton" />
        <div className="stack stack--sm">
          <h2>Checking this invoice…</h2>
          <p className="muted">Reading the merchant’s domain file and checking the signature.</p>
        </div>
      </section>
    );
  }
  const pass = verify.result === 'PASS';
  const failed = verify.checks.filter((c) => !c.ok).length;
  return (
    <section className={`verdict ${pass ? 'verdict--pass' : 'verdict--fail'}`} aria-live="assertive" aria-atomic="true">
      <div className="verdict__icon">
        <Icon name={pass ? 'check' : 'x'} />
      </div>
      <div className="stack stack--sm">
        <h2>{pass ? `PASS: matches ${domain ?? 'the merchant domain'}` : 'FAIL: do not pay this invoice'}</h2>
        <p>
          {pass
            ? 'The domain lists the signing wallet and the payout wallet, and nothing changed after signing. The contract pays only that payout wallet.'
            : `${failed} of ${verify.checks.length} checks failed. The failing rows are highlighted below.`}
        </p>
      </div>
    </section>
  );
}
