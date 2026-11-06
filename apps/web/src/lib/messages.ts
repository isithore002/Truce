import type { CheckId, ErrorCode, HealthReason, Overlay, Status } from './api/types';

/** Plain-language copy for check ids, statuses, health reasons and error codes. No internal ids reach the screen. */

export interface CheckContext {
  domain: string;
}

type CheckCopy = { title: string; ok: (c: CheckContext) => string; fail: (c: CheckContext) => string };

export const CHECK_MESSAGES: Record<CheckId, CheckCopy> = {
  document_valid: {
    title: 'Invoice is complete',
    ok: () => 'Every required field is present and well formed.',
    fail: () => 'This invoice is incomplete or damaged, so it cannot be checked.',
  },
  signature_valid: {
    title: 'Signature matches the invoice',
    ok: () => 'The invoice was signed by the merchant wallet and nothing changed after signing.',
    fail: () => 'The signature does not match this invoice. Something was changed after the merchant signed it.',
  },
  domain_file_reachable: {
    title: 'Merchant domain file found',
    ok: (c) => `We read the wallet list published at ${c.domain}/.well-known/truce.json.`,
    fail: (c) => `We could not read the wallet list at ${c.domain}/.well-known/truce.json.`,
  },
  merchant_matches_domain_file: {
    title: 'Signer is listed on the domain',
    ok: (c) => `The wallet that signed this invoice is the signing wallet ${c.domain} publishes.`,
    fail: (c) => `The wallet that signed this invoice is not the signing wallet listed on ${c.domain}.`,
  },
  payout_in_domain_file: {
    title: 'Payout wallet is listed on the domain',
    ok: (c) => `The wallet that receives the money is listed on ${c.domain}.`,
    fail: (c) => `The payout wallet is not listed on ${c.domain}. Do not pay this invoice.`,
  },
  domain_hash_matches: {
    title: 'Invoice names this domain',
    ok: (c) => `The signed invoice names ${c.domain}.`,
    fail: (c) => `The signed invoice names a different domain than ${c.domain}.`,
  },
  chain_and_token_allowed: {
    title: 'Network and token are accepted',
    ok: () => 'USDT on Whitechain Sepolia (testnet, chain 1874).',
    fail: () => 'This invoice asks for a token or network Truce does not accept.',
  },
  not_expired: {
    title: 'Invoice is still open',
    ok: () => 'The payment window has not closed.',
    fail: () => 'The payment window for this invoice has closed. Ask the merchant for a new one.',
  },
  memo_hash_matches_details: {
    title: 'Line items match the signature',
    ok: () => 'The names, items and notes you see are the ones the merchant signed.',
    fail: () => 'The names, items or notes shown differ from what the merchant signed.',
  },
  payer_ok: {
    title: 'You may pay this invoice',
    ok: () => 'The invoice is open to any payer, or to your wallet.',
    fail: () => 'This invoice can only be paid by a different wallet.',
  },
};

export function checkMessage(id: CheckId, ok: boolean, ctx: CheckContext): { title: string; text: string } {
  const copy = CHECK_MESSAGES[id];
  if (!copy) return { title: id, text: ok ? 'Passed.' : 'Failed.' };
  return { title: copy.title, text: ok ? copy.ok(ctx) : copy.fail(ctx) };
}

/** Checks that compare the invoice with the domain's wallet list. They cannot run when the list could not be read. */
const NEEDS_DOMAIN_FILE: CheckId[] = ['merchant_matches_domain_file', 'payout_in_domain_file'];

/**
 * The text for one check in the context of all of them. When the domain file could not be read, the comparison checks
 * were never run, so they say so instead of claiming the wallet is "not listed". They still count as FAIL: the buyer
 * must not be told an unconfirmed payee is fine.
 */
export function checkMessageIn(checks: { id: CheckId; ok: boolean }[], id: CheckId, ctx: CheckContext): { title: string; text: string } {
  const own = checks.find((c) => c.id === id);
  const fileUnreadable = checks.some((c) => c.id === 'domain_file_reachable' && !c.ok);
  const m = checkMessage(id, own?.ok ?? false, ctx);
  if (own && !own.ok && fileUnreadable && NEEDS_DOMAIN_FILE.includes(id)) {
    return { title: m.title, text: 'Not checked, because the domain file could not be read. The payee cannot be confirmed, so do not pay.' };
  }
  return m;
}

export type Tone = 'ok' | 'bad' | 'warn' | 'info' | 'neutral';

export const STATUS_BADGES: Record<Status, { label: string; tone: Tone; text: string }> = {
  ISSUED: { label: 'Issued', tone: 'neutral', text: 'Waiting for payment.' },
  SCHEDULED_OK: { label: 'Scheduled', tone: 'info', text: 'Signed to be collected on the due date. The last balance check passed.' },
  AT_RISK: { label: 'At risk', tone: 'warn', text: 'Signed to be collected on the due date, but the last check found a problem.' },
  PAID: { label: 'Paid', tone: 'ok', text: 'Settled on chain to the signed payout wallet.' },
  FAILED: { label: 'Failed', tone: 'bad', text: 'Collection failed on the due date. It retries until the payment window closes.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', text: 'The buyer cancelled the scheduled payment.' },
  EXPIRED: { label: 'Expired', tone: 'neutral', text: 'The payment window closed without payment.' },
};

export const OVERLAY_BADGES: Record<Overlay, { label: string; tone: Tone }> = {
  PARTIALLY_REFUNDED: { label: 'Partly refunded', tone: 'info' },
  REFUNDED: { label: 'Refunded', tone: 'info' },
};

export const HEALTH_MESSAGES: Record<HealthReason, string> = {
  NONE: 'The buyer wallet held enough USDT at the last check.',
  LOW_BALANCE: 'The buyer wallet holds less USDT than the invoice amount.',
  AUTH_CANCELLED: 'The buyer cancelled the signed authorization.',
  AUTH_EXPIRING: 'The signed authorization runs out before collection can finish.',
  BLOCKED: 'The token contract has blocked the buyer wallet.',
};

/** Copy required by docs/INTERFACES.md section 5. */
export const SNAPSHOT_NOTE = 'The balance check is a snapshot, not a lock. Funds stay in the buyer wallet until the due date.';
export const COMMITMENT_NOTE = 'A signed payment is a commitment, not locked funds.';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_DOCUMENT: 'This invoice is incomplete or damaged.',
  SIGNATURE_INVALID: 'The merchant signature does not match this invoice.',
  TOKEN_NOT_ALLOWED: 'This token is not accepted for payment.',
  EXPIRED: 'The payment window for this invoice has closed.',
  DUPLICATE: 'An invoice with this id already exists.',
  NOT_FOUND: 'We could not find this invoice. Check the link and try again.',
  AUTH_INVALID: 'Your payment signature could not be checked. Sign again.',
  WRONG_PAYER: 'This invoice can only be paid by a different wallet.',
  SIMULATION_FAILED: 'A test run of the payment failed, so nothing was sent. No funds moved.',
  INSUFFICIENT_BALANCE: 'Your wallet holds less USDT than this invoice asks for.',
  ALREADY_PAID: 'This invoice is already paid. Nothing was charged again.',
  RELAYER_BUDGET_EXHAUSTED: 'The gas sponsor has used today’s budget. Try again later, or submit the payment yourself with WBT.',
  RATE_LIMITED: 'Too many requests in a short time. Wait a minute and try again.',
  NOT_SCHEDULED: 'There is no scheduled payment to cancel.',
  NOT_PAID: 'This invoice has not been paid yet.',
  REFUND_EXCEEDS_PAID: 'A refund cannot be larger than the amount paid.',
  NOT_IMPLEMENTED: 'This option is not available on the server yet. Pay now instead.',
  INTERNAL: 'Something went wrong on our side. Try again in a moment.',
};

export function errorMessage(code: string | undefined, fallback?: string): string {
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code as ErrorCode];
  return fallback || ERROR_MESSAGES.INTERNAL;
}

/** Audit event type (apps/server events and the mock) -> plain label and tone. Unknown types fall back to a readable form. */
export const EVENT_LABELS: Record<string, { label: string; tone?: 'ok' | 'bad' | 'warn' | 'info' }> = {
  created: { label: 'Invoice created' },
  verified: { label: 'Checked' },
  authorized: { label: 'Buyer signed' },
  pending: { label: 'Payment sent, waiting for confirmation', tone: 'info' },
  paid: { label: 'Paid', tone: 'ok' },
  paid_onchain: { label: 'Paid (seen on chain)', tone: 'ok' },
  settle_failed: { label: 'Payment failed', tone: 'bad' },
  scheduled: { label: 'Scheduled for the due date', tone: 'info' },
  at_risk: { label: 'At risk', tone: 'warn' },
  collect_retry: { label: 'Collection will retry', tone: 'warn' },
  collect_failed: { label: 'Collection failed', tone: 'bad' },
  failed: { label: 'Collection failed', tone: 'bad' },
  cancel_pending: { label: 'Cancellation sent', tone: 'info' },
  cancelled: { label: 'Cancelled' },
  expired: { label: 'Expired' },
  refunded: { label: 'Refunded', tone: 'info' },
};

export function eventLabel(type: string) {
  return EVENT_LABELS[type] ?? { label: type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) };
}
