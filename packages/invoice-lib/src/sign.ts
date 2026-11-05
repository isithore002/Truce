import { recoverTypedDataAddress, type Address, type Hex, type LocalAccount } from "viem";
import { invoiceTypedData } from "./hash.js";
import type { Invoice, SigningContext } from "./types.js";

/** Merchant signs the invoice with an account that can sign typed data. */
export function signInvoice(account: Pick<LocalAccount, "signTypedData">, invoice: Invoice, ctx: SigningContext): Promise<Hex> {
  return account.signTypedData(invoiceTypedData(invoice, ctx));
}

/** Address that signed the invoice (EOA only; ERC-1271 wallets are checked on chain). */
export function recoverMerchant(invoice: Invoice, signature: Hex, ctx: SigningContext): Promise<Address> {
  return recoverTypedDataAddress({ ...invoiceTypedData(invoice, ctx), signature });
}
