import type { PayMode } from '../../lib/api/types';
import { formatDay, formatUsdt } from '../../lib/format';
import { COMMITMENT_NOTE, SNAPSHOT_NOTE } from '../../lib/messages';
import type { PayGate } from '../../lib/payGate';
import { Icon } from '../Icon';
import { PayProgress, type PayStep } from './PayProgress';

export interface PayPanelProps {
  gate: PayGate;
  amount: string;
  dueDate: string;
  mode: PayMode;
  onMode: (m: PayMode) => void;
  dueDateFeature: boolean;
  step: PayStep;
  error?: string;
  connected: boolean;
  onPay: () => void;
}

/** Presentational: the button is disabled whenever `gate.enabled` is false, and the reason is always shown. */
export function PayPanel({ gate, amount, dueDate, mode, onMode, dueDateFeature, step, error, connected, onPay }: PayPanelProps) {
  const busy = step !== 'idle' && step !== 'confirmed' && !error;
  const disabled = !gate.enabled || busy;
  const amt = formatUsdt(amount);
  const label = busy
    ? 'Follow your wallet…'
    : !connected
      ? `Connect wallet to pay ${amt} USDT`
      : mode === 'due'
        ? `Schedule ${amt} USDT for ${formatDay(dueDate)}`
        : `Pay ${amt} USDT`;

  return (
    <section className="card stack" aria-labelledby="pay-title">
      <h3 id="pay-title">Pay this invoice</h3>
      {dueDateFeature && gate.enabled && (
        <fieldset className="stack stack--sm" style={{ border: 0, padding: 0, margin: 0 }} disabled={busy}>
          <legend className="label" style={{ marginBottom: 8 }}>When</legend>
          <label className="check-row">
            <input type="radio" name="mode" checked={mode === 'now'} onChange={() => onMode('now')} />
            <span><strong>Pay now.</strong> Settles in a few seconds.</span>
          </label>
          <label className="check-row">
            <input type="radio" name="mode" checked={mode === 'due'} onChange={() => onMode('due')} />
            <span><strong>Pay on the due date, {formatDay(dueDate)}.</strong> You sign now; funds stay in your wallet until then. {SNAPSHOT_NOTE}</span>
          </label>
        </fieldset>
      )}
      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby="pay-reason"
        data-testid="pay-button"
        onClick={onPay}
      >
        {!busy && <Icon name={gate.enabled ? 'wallet' : 'x'} size={18} />}
        {label}
      </button>
      <div id="pay-reason">
        {!gate.enabled ? (
          <p className={`small${gate.tone === 'bad' ? '' : ' muted'}`} style={gate.tone === 'bad' ? { color: 'var(--bad)', fontWeight: 500 } : undefined}>{gate.reason}</p>
        ) : (
          <p className="small muted">One signature, no gas: a relayer pays the WBT fee. The contract pays only the payout wallet the merchant signed. {COMMITMENT_NOTE}</p>
        )}
      </div>
      <PayProgress step={step} failed={!!error} scheduled={mode === 'due'} />
      {error && (
        <div className="notice notice--bad" role="alert">
          <Icon name="alert" />
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
