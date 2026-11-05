import { pad, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  TRACK_USDT,
  domainHash,
  invoiceHash,
  memoHash,
  signInvoice,
  signReceiveAuthorization,
  type BuyerAuth,
  type Invoice,
  type InvoiceDetails,
  type InvoiceDoc,
  type PaymentMode,
} from "@truce/invoice-lib";

// Public Anvil test keys (never hold real funds): 0 = merchant, 1 = buyer, 2 = attacker.
export const merchant = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
export const buyer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
export const attacker = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

export const PAYOUT: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
export const ATTACKER_PAYOUT: Address = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
export const SETTLER: Address = "0x00000000000000000000000000005e77100000e1";
export const DOMAIN = "northlight-design.example";
export const T0 = 1_800_000_000n;
export const AMOUNT = 1_250_000_000n;

export const ctx = { chainId: 1874, verifyingContract: SETTLER };
export const tokenCtx = { chainId: 1874, token: TRACK_USDT };

export const details: InvoiceDetails = {
  merchantName: "Northlight Design Studio",
  clientName: "Beta Labs",
  lineItems: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: AMOUNT.toString() }],
  notes: "EXAMPLE DATA. Net 30.",
  example: true,
};

let idCounter = 1;

export async function makeDoc(over: Partial<Invoice> = {}): Promise<InvoiceDoc> {
  const invoice: Invoice = {
    invoiceId: pad(toHex(idCounter++), { size: 32 }),
    merchant: merchant.address,
    payout: PAYOUT,
    token: TRACK_USDT,
    amount: AMOUNT,
    dueDate: T0 + 7n * 86_400n,
    expiry: T0 + 30n * 86_400n,
    payer: "0x0000000000000000000000000000000000000000",
    domainHash: domainHash(DOMAIN),
    memoHash: memoHash(details),
    ...over,
  };
  return { version: 1, invoice, signature: await signInvoice(merchant, invoice, ctx), domain: DOMAIN, details };
}

export async function makeAuth(doc: InvoiceDoc, mode: PaymentMode = "now", signer = buyer): Promise<BuyerAuth> {
  const hash: Hex = invoiceHash(doc.invoice, ctx);
  return signReceiveAuthorization(signer, { settler: SETTLER, invoice: doc.invoice, invoiceHash: hash, mode }, tokenCtx);
}
