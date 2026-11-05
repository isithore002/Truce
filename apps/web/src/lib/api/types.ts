/**
 * Types for the Truce HTTP API and invoice document.
 *
 * These should be re-exported from @truce/invoice-lib. That package is still empty (see FRONTEND-REQUESTS.md R1),
 * so the frozen shapes from docs/INTERFACES.md are written out here, field for field, and nothing else.
 * Shapes the docs leave open are marked PROPOSED with the request id; the mock adapter uses them, the server may differ.
 * When invoice-lib lands: replace the frozen block with `export type { ... } from '@truce/invoice-lib'`.
 */

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

/* ---------- frozen: docs/INTERFACES.md sections 1 to 5 ---------- */

export interface Invoice {
  invoiceId: Hex;
  merchant: Address;
  payout: Address;
  token: Address;
  /** token base units as a decimal string (USDT: 6 decimals) */
  amount: string;
  /** unix seconds as a decimal string */
  dueDate: string;
  expiry: string;
  /** 0x0 = anyone may pay */
  payer: Address;
  domainHash: Hex;
  memoHash: Hex;
}

export interface LineItem {
  description: string;
  quantity: string;
  /** base units */
  unitPrice: string;
}

export interface InvoiceDetails {
  merchantName: string;
  clientName: string;
  lineItems: LineItem[];
  notes?: string;
  example?: boolean;
}

export interface InvoiceDoc {
  version: 1;
  invoice: Invoice;
  signature: Hex;
  domain: string;
  details: InvoiceDetails;
}

export interface DomainFile {
  version: 1;
  name: string;
  signingAddress: Address;
  payoutAddresses: Address[];
  chainIds: number[];
}

export const CHECK_IDS = [
  'document_valid',
  'signature_valid',
  'domain_file_reachable',
  'merchant_matches_domain_file',
  'payout_in_domain_file',
  'domain_hash_matches',
  'chain_and_token_allowed',
  'not_expired',
  'memo_hash_matches_details',
  'payer_ok',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export interface Check {
  id: CheckId;
  ok: boolean;
  message: string;
}

export type Verdict = 'PASS' | 'FAIL';

export interface VerifyResponse {
  result: Verdict;
  checks: Check[];
  /** INTERFACES.md writes `pin: {...}` without a shape (R5). The UI does not read it; pinning is browser-side. */
  pin?: unknown;
}

export const STATUSES = ['ISSUED', 'SCHEDULED_OK', 'AT_RISK', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;
export type Status = (typeof STATUSES)[number];
export const OVERLAYS = ['PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type Overlay = (typeof OVERLAYS)[number];

export const HEALTH_REASONS = ['NONE', 'LOW_BALANCE', 'AUTH_CANCELLED', 'AUTH_EXPIRING', 'BLOCKED'] as const;
export type HealthReason = (typeof HEALTH_REASONS)[number];

export type PayMode = 'now' | 'due';

export interface BuyerAuth {
  mode: PayMode;
  from: Address;
  validAfter: string;
  validBefore: string;
  v: number;
  r: Hex;
  s: Hex;
}

export interface CancelSig {
  v: number;
  r: Hex;
  s: Hex;
}

export const ERROR_CODES = [
  'INVALID_DOCUMENT', 'SIGNATURE_INVALID', 'TOKEN_NOT_ALLOWED', 'EXPIRED', 'DUPLICATE', 'NOT_FOUND', 'AUTH_INVALID',
  'WRONG_PAYER', 'SIMULATION_FAILED', 'INSUFFICIENT_BALANCE', 'ALREADY_PAID', 'RELAYER_BUDGET_EXHAUSTED', 'RATE_LIMITED',
  'NOT_SCHEDULED', 'NOT_PAID', 'REFUND_EXCEEDS_PAID', 'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode | string; message: string; details?: unknown };
}

/* ---------- PROPOSED: open in docs, requested in FRONTEND-REQUESTS.md ---------- */

/** R2: GET /api/config */
export interface PublicConfig {
  chainId: number;
  settler: Address;
  token: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  explorerUrl: string;
  exampleMode: boolean;
}

/** R3: `health` in GET /api/invoices/:hash */
export interface Health {
  ok: boolean;
  reason: HealthReason;
  checkedAt?: string;
}

/** R3: `tx` in GET /api/invoices/:hash */
export interface TxInfo {
  txHash: Hex;
  payer?: Address;
  paidAt?: string;
}

/** R4: audit trail for the timeline */
export interface AuditEvent {
  at: string;
  type: 'created' | 'verified' | 'authorized' | 'scheduled' | 'at_risk' | 'failed' | 'paid' | 'cancelled' | 'expired' | 'refunded';
  detail?: string;
  txHash?: Hex;
}

/** GET /api/invoices/:hash: `{ doc, status, health, tx? }` (frozen) + overlay and events (R3, R4) */
export interface InvoiceRecord {
  hash: Hex;
  doc: InvoiceDoc;
  status: Status;
  overlay?: Overlay;
  health?: Health;
  tx?: TxInfo;
  events?: AuditEvent[];
  /** Mode the buyer chose, when authorized (R3) */
  mode?: PayMode;
}

/** R6: GET /api/merchants/:address/invoices item */
export interface InvoiceSummary {
  hash: Hex;
  invoiceId: Hex;
  clientName: string;
  amount: string;
  dueDate: string;
  status: Status;
  overlay?: Overlay;
  healthReason?: HealthReason;
  txHash?: Hex;
  paidAt?: string;
  example?: boolean;
}

/** R7: GET /healthz */
export interface Healthz {
  ok: boolean;
  chainMode?: string;
  block?: string;
  relayerBalanceWei?: string;
  lastEvents?: { at: string; event: string; hash?: Hex }[];
}

export interface CreateInvoiceResult {
  hash: Hex;
  link: string;
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
