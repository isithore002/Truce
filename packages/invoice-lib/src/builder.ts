import { getAddress, pad, toHex, type Address, type Hex } from "viem";
import { TRACK_USDT } from "./authorization.js";
import type { DomainFile } from "./doc.js";
import { domainHash } from "./hash.js";
import { memoHash } from "./memo.js";
import type { Invoice, InvoiceDetails } from "./types.js";

const ZERO: Address = "0x0000000000000000000000000000000000000000";
const SECONDS_PER_DAY = 86_400;

/** Parses a decimal USDT amount such as "1250" or "0.01" into 6-decimal base units. Throws on anything else. */
export function parseUsdt(text: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) throw new Error("Enter an amount like 1250 or 0.01 (at most 6 decimals).");
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0"));
}

export interface LineItemInput {
  description: string;
  /** Whole number of units, as text. */
  quantity: string;
  /** Price of one unit in USDT, as text (for example "625.00"). */
  unitPrice: string;
}

export interface InvoiceInput {
  merchant: Address;
  /** Defaults to the merchant (signing) wallet. */
  payout?: Address;
  /** The domain that publishes /.well-known/truce.json. */
  domain: string;
  merchantName: string;
  clientName: string;
  lineItems: LineItemInput[];
  notes?: string;
  /** Unix seconds. Omit or 0 for "on receipt". */
  dueDate?: number;
  /** Days after the due date (or after now) that the invoice stays payable. Default 30. */
  validDays?: number;
  /** Only this wallet may pay. Omit for anyone. */
  payer?: Address;
  token?: Address;
  /** true shows the EXAMPLE DATA banner. */
  example?: boolean;
  /** Test hooks. */
  now?: number;
  invoiceId?: Hex;
}

function randomInvoiceId(): Hex {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return pad(toHex(bytes), { size: 32 });
}

/** Turns plain merchant input into the exact structures that get hashed and signed. The total is computed, never typed. */
export function buildInvoice(input: InvoiceInput): { invoice: Invoice; details: InvoiceDetails } {
  const domain = input.domain.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) throw new Error("Enter your website domain, for example northlight-design.example.");
  if (!input.merchantName.trim()) throw new Error("Enter your business name.");
  if (!input.clientName.trim()) throw new Error("Enter the client's name.");
  if (input.lineItems.length === 0) throw new Error("Add at least one line item.");

  let total = 0n;
  const lineItems = input.lineItems.map((li, i) => {
    if (!li.description.trim()) throw new Error(`Line ${i + 1} needs a description.`);
    if (!/^\d{1,6}$/.test(li.quantity.trim()) || BigInt(li.quantity) === 0n) throw new Error(`Line ${i + 1} needs a whole-number quantity of at least 1.`);
    const unit = parseUsdt(li.unitPrice);
    if (unit === 0n) throw new Error(`Line ${i + 1} needs a price above zero.`);
    total += unit * BigInt(li.quantity);
    return { description: li.description.trim(), quantity: String(BigInt(li.quantity)), unitPrice: unit.toString() };
  });

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const dueDate = input.dueDate && input.dueDate > 0 ? input.dueDate : 0;
  const validDays = input.validDays ?? 30;
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) throw new Error("The invoice must stay payable for 1 to 365 days.");
  const expiry = Math.max(dueDate, now) + validDays * SECONDS_PER_DAY;

  const details: InvoiceDetails = {
    merchantName: input.merchantName.trim(),
    clientName: input.clientName.trim(),
    lineItems,
    notes: input.notes?.trim() ?? "",
    example: input.example ?? false,
  };
  const merchant = getAddress(input.merchant);
  const invoice: Invoice = {
    invoiceId: input.invoiceId ?? randomInvoiceId(),
    merchant,
    payout: getAddress(input.payout ?? merchant),
    token: getAddress(input.token ?? TRACK_USDT),
    amount: total,
    dueDate: BigInt(dueDate),
    expiry: BigInt(expiry),
    payer: input.payer ? getAddress(input.payer) : ZERO,
    domainHash: domainHash(domain),
    memoHash: memoHash(details),
  };
  return { invoice, details };
}

/** The file a merchant publishes at https://<domain>/.well-known/truce.json. */
export function buildDomainFile(input: { name: string; signingAddress: Address; payoutAddresses?: Address[]; chainIds?: number[] }): DomainFile {
  const signingAddress = getAddress(input.signingAddress);
  const payouts = (input.payoutAddresses?.length ? input.payoutAddresses : [signingAddress]).map((a) => getAddress(a));
  return { version: 1, name: input.name.trim(), signingAddress, payoutAddresses: [...new Set(payouts)], chainIds: input.chainIds ?? [1874] };
}
