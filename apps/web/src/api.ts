import type { Address, Hex } from "viem";
import type { Check, InvoiceDocWire } from "@truce/invoice-lib";

export interface Config {
  chainId: number;
  settler: Address;
  tokens: Address[];
  explorerBase: string;
  exampleMode: boolean;
}

export type InvoiceStatus = "ISSUED" | "SCHEDULED_OK" | "AT_RISK" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";

export interface InvoiceEvent {
  at: number;
  type: string;
  detail?: string;
  txHash?: Hex;
}

export interface InvoiceView {
  doc: InvoiceDocWire;
  status: InvoiceStatus;
  payment?: { payer: Address; paidAt: number; txHash?: Hex };
  events: InvoiceEvent[];
}

export interface VerifyView {
  result: "PASS" | "FAIL";
  checks: Check[];
  invoiceHash?: Hex;
  domainFile?: { name: string; signingAddress: Address; payoutAddresses: Address[]; chainIds: number[] };
  onchain: { paid: boolean; payer?: Address; refunded?: string; txHash?: Hex; unavailable?: boolean };
}

export interface InvoiceSummary {
  hash: Hex;
  invoiceId: Hex;
  merchantName: string;
  clientName: string;
  amount: string;
  token: Address;
  dueDate: string;
  expiry: string;
  status: InvoiceStatus;
  txHash?: Hex;
  paidAt?: number;
  createdAt: number;
  example: boolean;
}

export interface AuthorizeBody {
  mode: "now" | "due";
  from: Address;
  validAfter: string;
  validBefore: string;
  v: number;
  r: Hex;
  s: Hex;
}

/** Any API failure, with the server's code (or NETWORK) and a message that is safe to show. */
export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiFailure("NETWORK", "Cannot reach the Truce server. Is it running?");
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  if (!res.ok && res.status !== 202) {
    const err = (json as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiFailure(err?.code ?? "ERROR", err?.message ?? `The server answered ${res.status}.`, res.status);
  }
  return json as T;
}

export const api = {
  config: () => request<Config>("GET", "/api/config"),
  invoice: (hash: string) => request<InvoiceView>("GET", `/api/invoices/${hash}`),
  verifyHash: (hash: string, buyer?: string) => request<VerifyView>("GET", `/api/verify?hash=${hash}${buyer ? `&buyer=${buyer}` : ""}`),
  verifyDoc: (doc: unknown, buyer?: string) => request<VerifyView>("POST", `/api/verify${buyer ? `?buyer=${buyer}` : ""}`, doc),
  authorize: (hash: string, body: AuthorizeBody) => request<{ status: "PAID" | "PENDING"; txHash?: Hex }>("POST", `/api/invoices/${hash}/authorize`, body),
  merchantInvoices: (address: string) => request<{ items: InvoiceSummary[] }>("GET", `/api/merchants/${address}/invoices`),
  createInvoice: (doc: unknown) => request<{ hash: Hex; link: string }>("POST", "/api/invoices", doc),
  csvUrl: (address: string) => `/api/merchants/${address}/export.csv`,
};
