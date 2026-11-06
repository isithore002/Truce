import { buildInvoice, invoiceHash, signInvoice, toWire, type InvoiceInput, type InvoiceDoc } from "@truce/invoice-lib";
import type { Address, Hex } from "viem";

/** Anything that can sign EIP-712 typed data: a viem account, or a wallet-backed signer. */
export interface TypedDataSigner {
  address: Address;
  signTypedData: (typed: never) => Promise<Hex>;
}

export interface CreateInvoiceOptions extends Omit<InvoiceInput, "merchant"> {
  /** Base URL of the Truce server, for example https://truce.example.com. */
  apiBase: string;
  /** The merchant's signing wallet. */
  signer: TypedDataSigner;
  /** Replace fetch in tests. */
  fetch?: typeof fetch;
}

export class TruceError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) {
    super(message);
    this.name = "TruceError";
  }
}

/** Builds the invoice, signs it with the merchant wallet and registers it. Returns the link to send to the buyer. */
export async function createInvoice(opts: CreateInvoiceOptions): Promise<{ link: string; hash: Hex }> {
  const { apiBase, signer, fetch: f = fetch, ...input } = opts;
  const base = apiBase.replace(/\/$/, "");
  const cfg = await call<{ chainId: number; settler: Address }>(f, "GET", `${base}/api/config`);
  const { invoice, details } = buildInvoice({ ...input, merchant: signer.address });
  const ctx = { chainId: cfg.chainId, verifyingContract: cfg.settler };
  const doc: InvoiceDoc = { version: 1, invoice, signature: await signInvoice(signer as never, invoice, ctx), domain: input.domain.trim().toLowerCase(), details };
  const res = await call<{ hash: Hex; link: string }>(f, "POST", `${base}/api/invoices`, toWire(doc));
  if (res.hash.toLowerCase() !== invoiceHash(invoice, ctx).toLowerCase()) throw new TruceError("HASH_MISMATCH", "The server returned a different invoice hash than the one signed.");
  return { link: res.link, hash: res.hash };
}

/** Current status of an invoice: ISSUED, PAID, EXPIRED and so on. */
export async function invoiceStatus(apiBase: string, hash: Hex, f: typeof fetch = fetch): Promise<{ status: string; txHash?: Hex }> {
  const r = await call<{ status: string; payment?: { txHash?: Hex } }>(f, "GET", `${apiBase.replace(/\/$/, "")}/api/invoices/${hash}`);
  return { status: r.status, txHash: r.payment?.txHash };
}

async function call<T>(f: typeof fetch, method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await f(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new TruceError("NETWORK", `Cannot reach the Truce server at ${url}.`);
  }
  const json = (await res.json().catch(() => undefined)) as { error?: { code?: string; message?: string } } | undefined;
  if (!res.ok) throw new TruceError(json?.error?.code ?? "ERROR", json?.error?.message ?? `The server answered ${res.status}.`, res.status);
  return json as T;
}
