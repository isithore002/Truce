import { formatUsdt } from '../../lib/format';

/** USDT amount from base units (6 decimals). Never a float. */
export function AmountUsdt({ value, size = 'md' }: { value: string | bigint; size?: 'sm' | 'md' | 'lg' }) {
  const fs = size === 'lg' ? 'var(--t-stat)' : size === 'md' ? 'var(--t-card)' : 'var(--t-body)';
  return (
    <span style={{ fontSize: fs, fontWeight: 500, letterSpacing: size === 'lg' ? '-0.03em' : undefined, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {formatUsdt(value)} <span className="muted" style={{ fontSize: size === 'lg' ? '0.5em' : '0.85em', fontWeight: 500 }}>USDT</span>
    </span>
  );
}
