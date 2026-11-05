import type { Address, Hex } from "viem";

/** The EIP-712 `Invoice` struct. Single source of truth: docs/INTERFACES.md section 1. */
export interface Invoice {
  /** 16 random bytes, left-padded to 32. */
  invoiceId: Hex;
  /** Signing wallet (EOA, or an ERC-1271 contract wallet). */
  merchant: Address;
  /** Where the funds go. Covered by the merchant signature. */
  payout: Address;
  /** Allowlisted ERC-20 with EIP-3009. */
  token: Address;
  /** Token base units (USDT: 6 decimals). */
  amount: bigint;
  /** Unix seconds. */
  dueDate: bigint;
  /** Last moment the invoice can be settled (unix seconds). */
  expiry: bigint;
  /** Zero address = anyone may pay. */
  payer: Address;
  /** keccak256(utf8(lowercase merchant domain)). */
  domainHash: Hex;
  /** keccak256(canonical JSON of InvoiceDetails). */
  memoHash: Hex;
}

export interface LineItem {
  description: string;
  /** Numbers are strings in canonical JSON. */
  quantity: string;
  unitPrice: string;
}

/** Off-chain details. Hashed into `memoHash`; changing any field breaks the signature. */
export interface InvoiceDetails {
  merchantName: string;
  clientName: string;
  lineItems: LineItem[];
  notes: string;
  /** true makes the UI show an "EXAMPLE DATA" banner. */
  example: boolean;
}

/** EIP-712 domain inputs that are not constant. */
export interface SigningContext {
  chainId: number;
  /** The InvoiceSettler address. */
  verifyingContract: Address;
}
