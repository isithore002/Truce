import { encodeAbiParameters, keccak256, parseSignature, type Address, type Hex, type LocalAccount } from "viem";
import type { Invoice } from "./types.js";

/** Track USDT on Whitechain Sepolia (6 decimals, EIP-1967 proxy, EIP-3009). */
export const TRACK_USDT: Address = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";

/** EIP-712 domain name and version of the track USDT (verified against its on-chain DOMAIN_SEPARATOR). */
export const TOKEN_DOMAIN_NAME = "Tether USD";
export const TOKEN_DOMAIN_VERSION = "1";

export const RECEIVE_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const CANCEL_AUTHORIZATION_TYPES = {
  CancelAuthorization: [
    { name: "authorizer", type: "address" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type PaymentMode = "now" | "due";

/** The buyer's signed authorization as the API carries it (docs/INTERFACES.md section 4). */
export interface BuyerAuth {
  mode: PaymentMode;
  from: Address;
  validAfter: bigint;
  validBefore: bigint;
  /** 27 or 28. */
  v: number;
  r: Hex;
  s: Hex;
}

export interface TokenContext {
  chainId: number;
  /** The EIP-3009 token (the proxy address for the track USDT). */
  token: Address;
}

export function tokenDomain(ctx: TokenContext) {
  return {
    name: TOKEN_DOMAIN_NAME,
    version: TOKEN_DOMAIN_VERSION,
    chainId: ctx.chainId,
    verifyingContract: ctx.token,
  } as const;
}

/**
 * The window the token will honour. The token checks `validAfter < now < validBefore` (both strict).
 * Pay now: valid immediately. Due date: valid after the invoice's due date. Always ends at the expiry.
 */
export function authorizationWindow(invoice: Pick<Invoice, "dueDate" | "expiry">, mode: PaymentMode) {
  return { validAfter: mode === "due" ? invoice.dueDate : 0n, validBefore: invoice.expiry };
}

/** EIP-3009 ReceiveWithAuthorization to the settler, with nonce = invoice hash. */
export function receiveAuthorizationTypedData(
  params: { from: Address; settler: Address; invoice: Pick<Invoice, "amount" | "dueDate" | "expiry">; invoiceHash: Hex; mode: PaymentMode },
  ctx: TokenContext,
) {
  const { validAfter, validBefore } = authorizationWindow(params.invoice, params.mode);
  return {
    domain: tokenDomain(ctx),
    types: RECEIVE_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: params.from,
      to: params.settler,
      value: params.invoice.amount,
      validAfter,
      validBefore,
      nonce: params.invoiceHash,
    },
  } as const;
}

/** Gasless cancel of an authorization nonce. Anyone can relay it; the buyer signs it. */
export function cancelAuthorizationTypedData(params: { authorizer: Address; nonce: Hex }, ctx: TokenContext) {
  return {
    domain: tokenDomain(ctx),
    types: CANCEL_AUTHORIZATION_TYPES,
    primaryType: "CancelAuthorization",
    message: { authorizer: params.authorizer, nonce: params.nonce },
  } as const;
}

/** Splits a 65-byte signature into the v (27 or 28), r, s the token and the settler take. */
export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const p = parseSignature(signature);
  return { v: Number(p.v ?? 27n + BigInt(p.yParity ?? 0)), r: p.r, s: p.s };
}

/** Signs a receive authorization with any account that can sign typed data and returns the API shape. */
export async function signReceiveAuthorization(
  account: Pick<LocalAccount, "address" | "signTypedData">,
  params: { settler: Address; invoice: Pick<Invoice, "amount" | "dueDate" | "expiry">; invoiceHash: Hex; mode: PaymentMode },
  ctx: TokenContext,
): Promise<BuyerAuth> {
  const typed = receiveAuthorizationTypedData({ ...params, from: account.address }, ctx);
  const sig = splitSignature(await account.signTypedData(typed));
  return { mode: params.mode, from: account.address, validAfter: typed.message.validAfter, validBefore: typed.message.validBefore, ...sig };
}

/** Signs a CancelAuthorization for an invoice's nonce. */
export async function signCancelAuthorization(
  account: Pick<LocalAccount, "address" | "signTypedData">,
  nonce: Hex,
  ctx: TokenContext,
): Promise<{ v: number; r: Hex; s: Hex }> {
  return splitSignature(await account.signTypedData(cancelAuthorizationTypedData({ authorizer: account.address, nonce }, ctx)));
}

/** The EIP-3009 nonce the payout wallet must sign for the next refund (matches InvoiceSettler.refundNonce). */
export function refundNonce(invoiceHash: Hex, refundedSoFar: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: "string" }, { type: "bytes32" }, { type: "uint256" }], ["REFUND", invoiceHash, refundedSoFar]));
}

/** A refund is the payout wallet's EIP-3009 authorization to the settler, valued at the refund amount. */
export async function signRefundAuthorization(
  account: Pick<LocalAccount, "address" | "signTypedData">,
  params: { settler: Address; amount: bigint; nonce: Hex; validAfter?: bigint; validBefore: bigint },
  ctx: TokenContext,
) {
  const message = { from: account.address, to: params.settler, value: params.amount, validAfter: params.validAfter ?? 0n, validBefore: params.validBefore, nonce: params.nonce };
  const sig = splitSignature(await account.signTypedData({ domain: tokenDomain(ctx), types: RECEIVE_AUTHORIZATION_TYPES, primaryType: "ReceiveWithAuthorization", message }));
  return { from: account.address, validAfter: message.validAfter, validBefore: message.validBefore, ...sig };
}
