import { getAddress, type Address, type Hex } from "viem";
import type { Invoice, InvoiceDetails } from "./types.js";

/** What is stored and what the payment link carries (docs/INTERFACES.md section 2). */
export interface InvoiceDoc {
  version: 1;
  invoice: Invoice;
  signature: Hex;
  /** Merchant domain that publishes /.well-known/truce.json. */
  domain: string;
  details: InvoiceDetails;
}

/** The JSON form: every number is a decimal string. */
export interface InvoiceDocWire {
  version: 1;
  invoice: Record<keyof Invoice, string>;
  signature: Hex;
  domain: string;
  details: InvoiceDetails;
}

/** /.well-known/truce.json (docs/INTERFACES.md section 3). */
export interface DomainFile {
  version: 1;
  name: string;
  signingAddress: Address;
  payoutAddresses: Address[];
  chainIds: number[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const UINT = /^\d{1,78}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function address(v: unknown, field: string): Address {
  if (typeof v !== "string") throw new Error(`${field} must be an address string`);
  try {
    return getAddress(v);
  } catch {
    throw new Error(`${field} is not a valid address`);
  }
}

function bytes32(v: unknown, field: string): Hex {
  if (typeof v !== "string" || !BYTES32.test(v)) throw new Error(`${field} must be 32 bytes of hex`);
  return v.toLowerCase() as Hex;
}

function uint(v: unknown, field: string, bits: number): bigint {
  if (typeof v !== "string" || !UINT.test(v)) throw new Error(`${field} must be a decimal string`);
  const n = BigInt(v);
  if (n >= 1n << BigInt(bits)) throw new Error(`${field} does not fit in ${bits} bits`);
  return n;
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string") throw new Error(`${field} must be a string`);
  return v;
}

function onlyKeys(o: Record<string, unknown>, allowed: string[], field: string) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`${field} has an unexpected field "${k}"`);
}

function parseDetails(raw: unknown): InvoiceDetails {
  if (!isObject(raw)) throw new Error("details must be an object");
  // Unknown keys would silently change memoHash, so they are rejected.
  onlyKeys(raw, ["merchantName", "clientName", "lineItems", "notes", "example"], "details");
  if (!Array.isArray(raw.lineItems)) throw new Error("details.lineItems must be a list");
  if (typeof raw.example !== "boolean") throw new Error("details.example must be true or false");
  return {
    merchantName: str(raw.merchantName, "details.merchantName"),
    clientName: str(raw.clientName, "details.clientName"),
    notes: str(raw.notes, "details.notes"),
    example: raw.example,
    lineItems: raw.lineItems.map((li, i) => {
      if (!isObject(li)) throw new Error(`details.lineItems[${i}] must be an object`);
      onlyKeys(li, ["description", "quantity", "unitPrice"], `details.lineItems[${i}]`);
      return {
        description: str(li.description, `details.lineItems[${i}].description`),
        quantity: str(li.quantity, `details.lineItems[${i}].quantity`),
        unitPrice: str(li.unitPrice, `details.lineItems[${i}].unitPrice`),
      };
    }),
  };
}

/** Strictly validates an untrusted invoice document. Never throws. */
export function parseInvoiceDoc(raw: unknown): Parsed<InvoiceDoc> {
  try {
    if (!isObject(raw)) throw new Error("the document must be a JSON object");
    if (raw.version !== 1) throw new Error("unsupported document version");
    const i = raw.invoice;
    if (!isObject(i)) throw new Error("invoice must be an object");
    onlyKeys(i, ["invoiceId", "merchant", "payout", "token", "amount", "dueDate", "expiry", "payer", "domainHash", "memoHash"], "invoice");
    if (typeof raw.signature !== "string" || !SIGNATURE.test(raw.signature)) throw new Error("signature must be 65 bytes of hex");
    const domain = str(raw.domain, "domain");
    if (domain.length === 0 || domain.length > 253) throw new Error("domain is empty or too long");
    const invoice: Invoice = {
      invoiceId: bytes32(i.invoiceId, "invoice.invoiceId"),
      merchant: address(i.merchant, "invoice.merchant"),
      payout: address(i.payout, "invoice.payout"),
      token: address(i.token, "invoice.token"),
      amount: uint(i.amount, "invoice.amount", 256),
      dueDate: uint(i.dueDate, "invoice.dueDate", 64),
      expiry: uint(i.expiry, "invoice.expiry", 64),
      payer: address(i.payer, "invoice.payer"),
      domainHash: bytes32(i.domainHash, "invoice.domainHash"),
      memoHash: bytes32(i.memoHash, "invoice.memoHash"),
    };
    return { ok: true, value: { version: 1, invoice, signature: raw.signature as Hex, domain, details: parseDetails(raw.details) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** JSON form of a document: bigints become decimal strings. */
export function toWire(doc: InvoiceDoc): InvoiceDocWire {
  const i = doc.invoice;
  return {
    version: 1,
    invoice: {
      invoiceId: i.invoiceId,
      merchant: i.merchant,
      payout: i.payout,
      token: i.token,
      amount: i.amount.toString(),
      dueDate: i.dueDate.toString(),
      expiry: i.expiry.toString(),
      payer: i.payer,
      domainHash: i.domainHash,
      memoHash: i.memoHash,
    },
    signature: doc.signature,
    domain: doc.domain,
    details: doc.details,
  };
}

/** Strictly validates an untrusted /.well-known/truce.json. Never throws. */
export function parseDomainFile(raw: unknown): Parsed<DomainFile> {
  try {
    if (!isObject(raw)) throw new Error("the file must be a JSON object");
    if (raw.version !== 1) throw new Error("unsupported version");
    if (!Array.isArray(raw.payoutAddresses) || raw.payoutAddresses.length === 0 || raw.payoutAddresses.length > 50) {
      throw new Error("payoutAddresses must list between 1 and 50 addresses");
    }
    if (!Array.isArray(raw.chainIds) || !raw.chainIds.every((c) => Number.isInteger(c) && c > 0)) throw new Error("chainIds must be a list of chain ids");
    return {
      ok: true,
      value: {
        version: 1,
        name: str(raw.name, "name"),
        signingAddress: address(raw.signingAddress, "signingAddress"),
        payoutAddresses: raw.payoutAddresses.map((a, n) => address(a, `payoutAddresses[${n}]`)),
        chainIds: raw.chainIds as number[],
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
