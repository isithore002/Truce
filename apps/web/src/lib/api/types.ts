/**
 * Types for the Truce HTTP API and invoice document, in the wire form the browser uses (numbers as decimal strings).
 *
 * Shared shapes come from @truce/invoice-lib (check ids, domain file, payment mode). The wire invoice is written out
 * with viem's Hex/Address types and checked against the library's `InvoiceDocWire` at compile time below.
 * Server response shapes are in `serverTypes.ts`; `client.ts` maps them onto the UI shapes in the second half of this file.
 */

import type { Check, DomainFile, InvoiceDocWire } from '@truce/invoice-lib';

export { CHECK_IDS } from '@truce/invoice-lib';
export type { Check, CheckId, DomainFile } from '@truce/invoice-lib';

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
  /** Always present (empty string for none): the library rejects details without it. */
  notes: string;
  /** true shows the EXAMPLE DATA banner */
  example: boolean;
}

export interface InvoiceDoc {
  version: 1;
  invoice: Invoice;
  signature: Hex;
  domain: string;
  details: InvoiceDetails;
}

/** Compile-time check: our wire document is assignable to the library's. */
type Assert<T extends true> = T;
export type _WireMatchesLib = Assert<InvoiceDoc extends InvoiceDocWire ? true : false>;

export type Verdict = 'PASS' | 'FAIL';

/** POST /api/verify and GET /api/verify?hash= (apps/server routes.ts `runVerify`). */
export interface VerifyResponse {
  result: Verdict;
  checks: Check[];
  /** The digest the merchant signed; absent when the document is not valid. */
  invoiceHash?: Hex;
  domainFile?: DomainFile;
  /** Read from InvoiceSettler. `unavailable` when the RPC could not be reached. */
  onchain?: { paid: boolean; payer?: Address; refunded?: string; txHash?: Hex; unavailable?: boolean };
}

/** GET /api/domain-check: does the file on the merchant's domain list the wallets they are about to use? */
export type DomainCheckStatus = 'OK' | 'UNREACHABLE' | 'INVALID_FILE' | 'SIGNER_MISMATCH' | 'PAYOUT_NOT_LISTED' | 'CHAIN_NOT_LISTED';
export interface DomainCheck {
  status: DomainCheckStatus;
  domain: string;
  /** Plain-language result written by the server. */
  message: string;
  /** True when the answer came from the server's fictional example list rather than from the internet. */
  demo: boolean;
  listed?: { signingAddress: Address; payoutAddresses: Address[] };
  /** Demo domains only: the server can publish this fictional name for the connected wallet. */
  canRegister?: boolean;
  /** Demo domains only: why it cannot (a built-in example, or a name another wallet registered). */
  registerBlocked?: string;
}

export const STATUSES =['ISSUED', 'SCHEDULED_OK', 'AT_RISK', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;
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

/** The payout wallet's signed refund (amount in USDT base units). The server relays it; the contract pays only the original payer. */
export interface RefundRequest {
  amount: string;
  from: Address;
  validAfter: string;
  validBefore: string;
  v: number;
  r: Hex;
  s: Hex;
}

export interface RefundResult {
  status: 'REFUNDED' | 'PENDING';
  txHash?: Hex;
  /** Base units, as decimal strings. Absent while the transaction is still pending. */
  amount?: string;
  refunded?: string;
  remaining?: string;
}

export interface CancelSig {
  v: number;
  r: Hex;
  s: Hex;
}

export const ERROR_CODES = [
  'INVALID_DOCUMENT', 'SIGNATURE_INVALID', 'TOKEN_NOT_ALLOWED', 'EXPIRED', 'DUPLICATE', 'NOT_FOUND', 'AUTH_INVALID',
  'WRONG_PAYER', 'SIMULATION_FAILED', 'INSUFFICIENT_BALANCE', 'ALREADY_PAID', 'RELAYER_BUDGET_EXHAUSTED', 'RATE_LIMITED',
  'NOT_SCHEDULED', 'NOT_PAID', 'REFUND_EXCEEDS_PAID', 'NOT_IMPLEMENTED', 'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode | string; message: string; details?: unknown };
}

/* ---------- UI shapes: client.ts maps the server responses (serverTypes.ts) onto these; mock.ts produces them directly ---------- */

/** GET /api/config, normalised (the server sends tokens[] and explorerBase) */
export interface PublicConfig {
  chainId: number;
  settler: Address;
  token: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  explorerUrl: string;
  exampleMode: boolean;
}

/** `health` in GET /api/invoices/:hash (ok is derived: reason NONE) */
export interface Health {
  ok: boolean;
  reason: HealthReason;
  checkedAt?: string;
}

/** `payment` in GET /api/invoices/:hash */
export interface TxInfo {
  txHash: Hex;
  payer?: Address;
  paidAt?: string;
}

/** Audit trail entry (`events` in GET /api/invoices/:hash); times as ISO strings */
export interface AuditEvent {
  at: string;
  /** created, authorized, pending, paid, paid_onchain, settle_failed, scheduled, at_risk, failed, cancelled, expired, refunded */
  type: string;
  detail?: string;
  txHash?: Hex;
}

/** GET /api/invoices/:hash */
export interface InvoiceRecord {
  hash: Hex;
  doc: InvoiceDoc;
  status: Status;
  overlay?: Overlay;
  health?: Health;
  tx?: TxInfo;
  events?: AuditEvent[];
  /** 'due' when a due-date authorization is stored (the server sends `schedule`) */
  mode?: PayMode;
}

/** GET /api/merchants/:address/invoices item */
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

/** GET /healthz, normalised */
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
