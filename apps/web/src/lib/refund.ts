import type { Overlay } from './api/types';
import { formatUsdt, parseUsdt } from './format';

/** How long a signed refund stays valid. Short on purpose: it is a one-off instruction, not a standing permission. */
export const REFUND_VALID_SECONDS = 3600;

const big = (v: bigint | string) => (typeof v === 'bigint' ? v : BigInt(v));

/** What can still be refunded: the amount paid minus everything already returned (read from the chain). */
export function remainingToRefund(paid: bigint | string, refunded: bigint | string): bigint {
  const left = big(paid) - big(refunded);
  return left > 0n ? left : 0n;
}

/** Badge overlay for a paid invoice: nothing until a refund happens, then partly or fully refunded. */
export function refundOverlay(paid: bigint | string, refunded: bigint | string): Overlay | undefined {
  const r = big(refunded);
  if (r <= 0n) return undefined;
  return r >= big(paid) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}

export type RefundAmount = { ok: true; value: bigint } | { ok: false; error: string };

/** The amount field: a USDT decimal, above 0, no more than what is left. The contract enforces the same cap. */
export function parseRefundAmount(input: string, remaining: bigint): RefundAmount {
  const p = parseUsdt(input);
  if (!p.ok) return p;
  if (p.value === 0n) return { ok: false, error: 'Enter an amount above 0' };
  if (p.value > remaining) return { ok: false, error: `At most ${formatUsdt(remaining)} USDT is left to refund` };
  return p;
}
