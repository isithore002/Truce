import type { Address, InvoiceDoc, Status, VerifyResponse } from './api/types';
import { ZERO_ADDRESS } from './api/types';
import { sameAddress, shortAddress } from './format';
import type { PinCheck } from './pins';

/**
 * Decides whether the Pay button is enabled, and if not, the reason shown under it.
 * Pure, so the rule "Pay is never enabled unless the result is PASS" is unit-tested for every FAIL scenario.
 */

export interface PayGateInput {
  verify?: VerifyResponse;
  loading?: boolean;
  doc?: InvoiceDoc;
  status?: Status;
  /** true for a #doc copy: checked but not stored, so it has no hash to pay against */
  fromDocLink?: boolean;
  pin?: PinCheck;
  pinConfirmed?: boolean;
  account?: Address;
  libAvailable: boolean;
  settlerKnown: boolean;
  nowSec?: number;
}

export type PayGate = { enabled: true } | { enabled: false; reason: string; tone: 'bad' | 'neutral' | 'warn' };

export function payGate(i: PayGateInput): PayGate {
  if (i.loading || !i.verify || !i.doc) return { enabled: false, reason: 'Checking the invoice first.', tone: 'neutral' };
  if (i.verify.result !== 'PASS') {
    const n = i.verify.checks.filter((c) => !c.ok).length;
    return { enabled: false, reason: `Payment is blocked: ${n} ${n === 1 ? 'check' : 'checks'} failed. Do not pay this invoice.`, tone: 'bad' };
  }
  if (i.fromDocLink) return { enabled: false, reason: 'This copy came inside the link and is not stored. Ask the merchant for its /pay link to pay.', tone: 'neutral' };
  switch (i.status) {
    case 'PAID': return { enabled: false, reason: 'This invoice is already paid.', tone: 'neutral' };
    case 'SCHEDULED_OK':
    case 'AT_RISK':
    case 'FAILED': return { enabled: false, reason: 'A payment is already signed for this invoice.', tone: 'neutral' };
    case 'CANCELLED': return { enabled: false, reason: 'The scheduled payment was cancelled. Ask the merchant for a new invoice.', tone: 'neutral' };
    case 'EXPIRED': return { enabled: false, reason: 'The payment window has closed.', tone: 'neutral' };
    default: break;
  }
  if (Number(i.doc.invoice.expiry) <= (i.nowSec ?? Math.floor(Date.now() / 1000))) return { enabled: false, reason: 'The payment window has closed.', tone: 'neutral' };
  if (i.pin?.state === 'CHANGED' && !i.pinConfirmed) return { enabled: false, reason: 'Confirm the wallet change above before paying.', tone: 'warn' };
  const payer = i.doc.invoice.payer;
  if (i.account && !sameAddress(payer, ZERO_ADDRESS) && !sameAddress(payer, i.account)) {
    return { enabled: false, reason: `Only ${shortAddress(payer)} can pay this invoice. Switch wallets to continue.`, tone: 'warn' };
  }
  if (!i.libAvailable) return { enabled: false, reason: 'Signing needs @truce/invoice-lib, which is not published yet. Mock mode works today.', tone: 'neutral' };
  if (!i.settlerKnown) return { enabled: false, reason: 'Waiting for the server settings (settler address).', tone: 'neutral' };
  return { enabled: true };
}
