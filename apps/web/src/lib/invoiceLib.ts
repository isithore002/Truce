import {
  cancelAuthorizationTypedData as libCancelTypedData,
  domainHash as libDomainHash,
  invoiceHash as libInvoiceHash,
  invoiceTypedData as libInvoiceTypedData,
  memoHash as libMemoHash,
  receiveAuthorizationTypedData,
  splitSignature as libSplitSignature,
  type Invoice as LibInvoice,
  type PaymentMode,
} from '@truce/invoice-lib';
import { pad, toHex, type TypedDataDefinition } from 'viem';
import type { Address, Hex, Invoice, InvoiceDetails } from './api/types';

/**
 * The only door to hashing and typed-data building. Everything here delegates to @truce/invoice-lib; the web app
 * only converts between the wire form it uses everywhere (numbers as decimal strings) and the library's bigints.
 * The library is pure (no network, no keys), so mock mode uses it too: hashes and typed data are real in both modes.
 * Only the mock wallet's signature is fake (lib/wallet), and the mock adapter never recovers signatures.
 */

export interface InvoiceCtx {
  chainId: number;
  settler: Address;
}

/** Wire invoice (decimal strings) -> library invoice (bigints). */
export function toLibInvoice(i: Invoice): LibInvoice {
  return { ...i, amount: BigInt(i.amount), dueDate: BigInt(i.dueDate), expiry: BigInt(i.expiry) };
}

const signingCtx = (ctx: InvoiceCtx) => ({ chainId: ctx.chainId, verifyingContract: ctx.settler });

/** The library's details type requires notes and example; the wire form always carries both. */
const libDetails = (d: InvoiceDetails) => ({ ...d, notes: d.notes ?? '', example: d.example ?? false });

export const invoiceLib = {
  /** 16 random bytes, left-padded to 32 (INTERFACES section 1). Not a hash. */
  newInvoiceId(): Hex {
    return pad(toHex(globalThis.crypto.getRandomValues(new Uint8Array(16))), { size: 32 });
  },
  domainHash: (domain: string): Hex => libDomainHash(domain),
  memoHash: (details: InvoiceDetails): Hex => libMemoHash(libDetails(details)),
  invoiceHash: (invoice: Invoice, ctx: InvoiceCtx): Hex => libInvoiceHash(toLibInvoice(invoice), signingCtx(ctx)),
  invoiceTypedData: (invoice: Invoice, ctx: InvoiceCtx) =>
    libInvoiceTypedData(toLibInvoice(invoice), signingCtx(ctx)) as unknown as TypedDataDefinition,
  /** EIP-3009 ReceiveWithAuthorization to the settler, nonce = invoice hash, window from the library. */
  receiveWithAuthorizationTypedData(p: { invoice: Invoice; invoiceHash: Hex; from: Address; settler: Address; mode: PaymentMode; chainId: number }) {
    const typed = receiveAuthorizationTypedData(
      { from: p.from, settler: p.settler, invoice: toLibInvoice(p.invoice), invoiceHash: p.invoiceHash, mode: p.mode },
      { chainId: p.chainId, token: p.invoice.token },
    );
    return {
      typed: typed as unknown as TypedDataDefinition,
      validAfter: typed.message.validAfter.toString(),
      validBefore: typed.message.validBefore.toString(),
    };
  },
  cancelAuthorizationTypedData: (p: { token: Address; chainId: number; authorizer: Address; nonce: Hex }) =>
    libCancelTypedData({ authorizer: p.authorizer, nonce: p.nonce }, { chainId: p.chainId, token: p.token }) as unknown as TypedDataDefinition,
  splitSignature: (sig: Hex) => libSplitSignature(sig),
};

/** Random hex for mock-only stand-ins (fake tx hashes, fake signatures). Not a hash of anything. */
export function randomHex(bytes = 32): Hex {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return `0x${Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
