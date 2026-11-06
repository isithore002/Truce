import type { PinCheck } from '../../lib/pins';
import { formatIso } from '../../lib/format';
import { Icon } from '../Icon';
import { AddressChip } from '../invoice/AddressChip';

/** Key pinning result for this domain: NEW, MATCH or CHANGED (with a required confirmation). */
export function PinWarning({ pin, domain, confirmed, onConfirm }: { pin: PinCheck; domain: string; confirmed: boolean; onConfirm: (v: boolean) => void }) {
  if (pin.state === 'NEW') {
    return (
      <div className="notice notice--info" role="note">
        <Icon name="key" />
        <div>
          <p><strong>First payment to {domain} from this browser.</strong></p>
          <p>This browser has not seen {domain} before, so a lookalike domain would look the same. For a large amount, confirm the payout wallet with the merchant another way, such as a phone call.</p>
          <p>After you pay, this browser remembers its wallets and warns you if they change.</p>
        </div>
      </div>
    );
  }
  if (pin.state === 'MATCH') {
    return (
      <div className="notice notice--ok" role="note">
        <Icon name="check" />
        <div>
          <p><strong>Same wallets as your last payment to {domain}.</strong></p>
          <p>Remembered on {formatIso(pin.pin.pinnedAt)}.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="notice notice--warn" role="alert">
      <Icon name="alert" />
      <div className="stack stack--sm" style={{ minWidth: 0 }}>
        <p><strong>This domain’s wallets changed since your last payment.</strong></p>
        <p>Check with {domain} by phone or in person before you pay. A changed wallet is how payment redirection fraud usually starts.</p>
        <dl className="kv" style={{ color: 'var(--p-ink)' }}>
          {pin.signingChanged && (
            <>
              <dt>Signing wallet</dt>
              <dd className="stack stack--sm" style={{ gap: 2 }}>
                <AddressChip value={pin.pin.signingAddress} label="Was" />
                <AddressChip value={pin.current.signingAddress} label="Now" />
              </dd>
            </>
          )}
          {pin.payoutChanged && (
            <>
              <dt>Payout wallet</dt>
              <dd className="stack stack--sm" style={{ gap: 2 }}>
                {pin.pin.payoutAddresses.map((a) => <AddressChip key={a} value={a} label="Was" />)}
                <AddressChip value={pin.current.payout} label="Now" />
              </dd>
            </>
          )}
        </dl>
        <label className="check-row" style={{ color: 'var(--p-ink)' }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
          <span>I confirmed the new wallets with {domain} and want to pay them.</span>
        </label>
      </div>
    </div>
  );
}
