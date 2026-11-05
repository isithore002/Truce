import { hashTypedData, keccak256, stringToHex, type Hex } from "viem";
import type { Invoice, SigningContext } from "./types.js";

/** EIP-712 type for the invoice. Must match InvoiceSettler's type string exactly. */
export const INVOICE_TYPES = {
  Invoice: [
    { name: "invoiceId", type: "bytes32" },
    { name: "merchant", type: "address" },
    { name: "payout", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "dueDate", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "payer", type: "address" },
    { name: "domainHash", type: "bytes32" },
    { name: "memoHash", type: "bytes32" },
  ],
} as const;

/** keccak256 of the lowercase UTF-8 merchant domain. */
export function domainHash(domain: string): Hex {
  return keccak256(stringToHex(domain.toLowerCase()));
}

/** viem typed-data object for an invoice. Domain: { name "Truce", version "1", chainId, verifyingContract }. */
export function invoiceTypedData(invoice: Invoice, ctx: SigningContext) {
  return {
    domain: {
      name: "Truce",
      version: "1",
      chainId: ctx.chainId,
      verifyingContract: ctx.verifyingContract,
    },
    types: INVOICE_TYPES,
    primaryType: "Invoice",
    message: invoice,
  } as const;
}

/** The EIP-712 digest. It is also the EIP-3009 nonce and the on-chain invoice key. */
export function invoiceHash(invoice: Invoice, ctx: SigningContext): Hex {
  return hashTypedData(invoiceTypedData(invoice, ctx));
}
