import { pad, type Hex } from "viem";
import { domainHash } from "../src/hash.js";
import { memoHash } from "../src/memo.js";
import type { Invoice, InvoiceDetails, SigningContext } from "../src/types.js";

export const ctx: SigningContext = {
  chainId: 1874,
  verifyingContract: "0x0000000000000000000000000000000000001234",
};

export const details: InvoiceDetails = {
  merchantName: "Northlight Design Studio",
  clientName: "Beta Labs",
  lineItems: [{ description: "Brand identity", quantity: "1", unitPrice: "1250000000" }],
  notes: "Net 30",
  example: true,
};

export const baseInvoice: Invoice = {
  invoiceId: pad("0x0102030405060708090a0b0c0d0e0f10", { size: 32 }),
  merchant: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  payout: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  token: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
  amount: 1_250_000_000n,
  dueDate: 1_767_225_600n,
  expiry: 1_767_484_800n,
  payer: "0x0000000000000000000000000000000000000000",
  domainHash: domainHash("northlight-design.example"),
  memoHash: memoHash(details),
};

// Widely published Anvil/Hardhat default account 0 test key. Never holds real funds.
export const ANVIL_KEY_0: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
