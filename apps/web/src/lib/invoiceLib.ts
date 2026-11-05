import type { TypedDataDefinition } from 'viem';
import type { Address, Hex, Invoice, InvoiceDetails } from './api/types';
import { config } from './config';

/**
 * The only door to hashing and typed-data building. The web app must not re-implement them:
 * they belong to @truce/invoice-lib (owner: developer A). That package has no exports yet (FRONTEND-REQUESTS.md R1),
 * so in server mode every builder throws InvoiceLibMissingError and the UI shows the reason on a disabled button.
 * In mock mode a stand-in returns random ids and placeholder typed data that only the mock wallet accepts.
 *
 * When invoice-lib lands, implement `realLib` with its exports (one file change):
 *   import { newInvoiceId, domainHash, memoHash, invoiceTypedData, receiveWithAuthorizationTypedData,
 *            cancelAuthorizationTypedData, invoiceHash } from '@truce/invoice-lib';
 */

export interface InvoiceCtx {
  chainId: number;
  settler: Address;
}

export interface InvoiceLibApi {
  available: boolean;
  newInvoiceId(): Hex;
  domainHash(domain: string): Hex;
  memoHash(details: InvoiceDetails): Hex;
  invoiceHash(invoice: Invoice, ctx: InvoiceCtx): Hex;
  invoiceTypedData(invoice: Invoice, ctx: InvoiceCtx): TypedDataDefinition;
  receiveWithAuthorizationTypedData(p: {
    token: Address; chainId: number; from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex;
  }): TypedDataDefinition;
  cancelAuthorizationTypedData(p: { token: Address; chainId: number; authorizer: Address; nonce: Hex }): TypedDataDefinition;
}

export class InvoiceLibMissingError extends Error {
  constructor(what: string) {
    super(`${what} needs @truce/invoice-lib, which has no exports yet. Use mock mode or wait for the library.`);
    this.name = 'InvoiceLibMissingError';
  }
}

const missing = (what: string) => () => {
  throw new InvoiceLibMissingError(what);
};

const realLib: InvoiceLibApi = {
  available: false,
  newInvoiceId: missing('Creating an invoice id'),
  domainHash: missing('Hashing the domain'),
  memoHash: missing('Hashing the invoice details'),
  invoiceHash: missing('Hashing the invoice'),
  invoiceTypedData: missing('Signing the invoice'),
  receiveWithAuthorizationTypedData: missing('Signing the payment'),
  cancelAuthorizationTypedData: missing('Signing the cancellation'),
};

/** Random 32-byte hex. A mock stand-in only: not a hash of anything. */
export function randomHex(bytes = 32): Hex {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return `0x${Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const placeholder = (primaryType: string, message: Record<string, unknown>): TypedDataDefinition =>
  ({ domain: { name: 'Truce mock (not signable)' }, types: { [primaryType]: [] }, primaryType, message }) as unknown as TypedDataDefinition;

export const mockLib: InvoiceLibApi = {
  available: true,
  newInvoiceId: () => `0x${'0'.repeat(32)}${randomHex(16).slice(2)}` as Hex,
  domainHash: () => randomHex(),
  memoHash: () => randomHex(),
  invoiceHash: () => randomHex(),
  invoiceTypedData: (invoice) => placeholder('Invoice', { ...invoice }),
  receiveWithAuthorizationTypedData: (p) => placeholder('ReceiveWithAuthorization', { ...p }),
  cancelAuthorizationTypedData: (p) => placeholder('CancelAuthorization', { ...p }),
};

export const invoiceLib: InvoiceLibApi = config.apiMode === 'mock' ? mockLib : realLib;
