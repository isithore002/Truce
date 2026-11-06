import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Hex, VerifyResponse } from '../../lib/api/types';
import { merchantHints } from '../../lib/merchantHints';
import { checkMessageIn } from '../../lib/messages';
import { Icon } from '../Icon';

/**
 * Shown right after an invoice is created: the same check the buyer's page will run, so the merchant finds out about a
 * FAIL (wrong wallet, no published file) before sending the link, with what to change. It reads the server's verify result
 * for the stored invoice and invents nothing. A series shares one domain and wallet, so one invoice is checked for all.
 */
export function BuyerVerdict({ hash, domain, forSeries }: { hash: Hex; domain: string; forSeries?: boolean }) {
  const [verdict, setVerdict] = useState<VerifyResponse>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.verifyHash(hash).then(
      (v) => live && setVerdict(v),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [hash, attempt]);

  if (failed) {
    return (
      <div className="notice notice--warn" role="alert">
        <Icon name="alert" />
        <div className="stack stack--sm">
          <p>We could not check what your buyer will see just now. The invoice is saved; you can check it on the Verify page.</p>
          <button type="button" className="btn btn--secondary" onClick={() => { setFailed(false); setAttempt((a) => a + 1); }}>Try again</button>
        </div>
      </div>
    );
  }
  if (!verdict) {
    return (
      <div className="notice notice--info" aria-busy="true">
        <Icon name="clock" />
        <p>Checking what your buyer will see…</p>
      </div>
    );
  }

  const passed = verdict.checks.filter((c) => c.ok).length;
  const scope = forSeries ? ' (checked on the first invoice; the others share the same domain and wallets)' : '';
  if (verdict.result === 'PASS') {
    return (
      <div className="notice notice--ok">
        <Icon name="check" />
        <p><strong>Your buyer will see PASS.</strong> {passed} of {verdict.checks.length} checks pass, so they can pay{scope}.</p>
      </div>
    );
  }

  const failing = verdict.checks.filter((c) => !c.ok);
  const hints = merchantHints(verdict.checks, domain);
  return (
    <div className="notice notice--bad" role="alert">
      <Icon name="alert" />
      <div className="stack stack--sm">
        <p><strong>Your buyer will see FAIL, so do not send this link yet.</strong> {passed} of {verdict.checks.length} checks pass{scope}.</p>
        <ul className="stack stack--sm" style={{ margin: 0, paddingLeft: 18 }}>
          {failing.map((c) => {
            const m = checkMessageIn(verdict.checks, c.id, { domain });
            return <li key={c.id}><strong>{m.title}.</strong> {m.text}</li>;
          })}
        </ul>
        <p><strong>What to change:</strong></p>
        <ul className="stack stack--sm" style={{ margin: 0, paddingLeft: 18 }}>
          {hints.map((h) => <li key={h}>{h}</li>)}
        </ul>
        <p className="small muted">The signed invoice cannot be edited. After fixing it, create a new invoice.</p>
      </div>
    </div>
  );
}
