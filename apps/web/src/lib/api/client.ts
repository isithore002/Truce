import type {
  Address, ApiErrorBody, BuyerAuth, CancelSig, CreateInvoiceResult, Healthz, Hex, InvoiceDoc, InvoiceRecord,
  HealthReason, InvoiceSummary, PublicConfig, VerifyResponse,
} from './types';
import type { ServerAuthorize, ServerConfig, ServerHealthz, ServerInvoice, ServerSummary } from './serverTypes';
import { config } from '../config';

/** One interface, two adapters: HTTP (this file) and the scenario mock (mock.ts). Selected by VITE_API_MODE. */
export interface TruceApi {
  readonly mode: 'mock' | 'server';
  getConfig(): Promise<PublicConfig>;
  createInvoice(doc: InvoiceDoc): Promise<CreateInvoiceResult>;
  getInvoice(hash: Hex): Promise<InvoiceRecord>;
  verifyHash(hash: Hex): Promise<VerifyResponse>;
  /** Checks a document without storing it (the #doc link form) */
  verifyDoc(doc: InvoiceDoc): Promise<VerifyResponse>;
  /** PAID with the tx hash, or PENDING while the relayer waits for confirmation (poll getInvoice) */
  authorize(hash: Hex, auth: BuyerAuth): Promise<{ status: 'PAID' | 'PENDING' | 'SCHEDULED_OK'; txHash?: Hex }>;
  cancel(hash: Hex, sig: CancelSig): Promise<{ txHash: Hex }>;
  listMerchantInvoices(address: Address): Promise<InvoiceSummary[]>;
  exportCsv(address: Address): Promise<Blob>;
  healthz(): Promise<Healthz>;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, as: 'json' | 'blob' = 'json'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiBase}${path}`, {
      ...init,
      headers: { Accept: as === 'json' ? 'application/json' : 'text/csv', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError('NETWORK', `Could not reach the Truce server at ${config.apiBase}.`);
  }
  if (!res.ok) {
    let body: Partial<ApiErrorBody> | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* not JSON */
    }
    throw new ApiError(body?.error?.code ?? (res.status === 404 ? 'NOT_FOUND' : 'INTERNAL'), body?.error?.message ?? res.statusText, res.status, body?.error?.details);
  }
  return (as === 'blob' ? res.blob() : res.json()) as Promise<T>;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

const iso = (unix?: number) => (unix === undefined ? undefined : new Date(unix * 1000).toISOString());

/* Maps apps/server responses onto the UI shapes. Field names only; no values are invented. */
export const fromServer = {
  config: (c: ServerConfig): PublicConfig => ({
    chainId: c.chainId, settler: c.settler, token: c.tokens[0], tokenSymbol: 'USDT', tokenDecimals: 6, explorerUrl: c.explorerBase, exampleMode: c.exampleMode,
  }),
  invoice: (hash: Hex, r: ServerInvoice): InvoiceRecord => ({
    hash, doc: r.doc, status: r.status,
    health: r.health && { ok: r.health.reason === 'NONE', reason: r.health.reason as HealthReason, checkedAt: iso(r.health.checkedAt) },
    tx: r.payment?.txHash ? { txHash: r.payment.txHash, payer: r.payment.payer, paidAt: iso(r.payment.paidAt) } : undefined,
    events: r.events.map((e) => ({ ...e, at: iso(e.at)! })),
    mode: r.schedule ? 'due' : undefined,
  }),
  summary: (s: ServerSummary): InvoiceSummary => ({
    hash: s.hash, invoiceId: s.invoiceId, clientName: s.clientName, amount: s.amount, dueDate: s.dueDate, status: s.status,
    txHash: s.txHash, paidAt: iso(s.paidAt), example: s.example, healthReason: s.healthReason as HealthReason | undefined,
  }),
  healthz: (h: ServerHealthz): Healthz => ({
    ok: h.ok, chainMode: h.mode, block: h.rpc?.blockNumber, relayerBalanceWei: h.relayer?.wbtBalance,
  }),
};

export const httpApi: TruceApi = {
  mode: 'server',
  getConfig: async () => fromServer.config(await request<ServerConfig>('/api/config')),
  createInvoice: (doc) => request<CreateInvoiceResult>('/api/invoices', post(doc)),
  getInvoice: async (hash) => fromServer.invoice(hash, await request<ServerInvoice>(`/api/invoices/${hash}`)),
  verifyHash: (hash) => request<VerifyResponse>(`/api/verify?hash=${encodeURIComponent(hash)}`),
  verifyDoc: (doc) => request<VerifyResponse>('/api/verify', post(doc)),
  authorize: (hash, auth) => request<ServerAuthorize>(`/api/invoices/${hash}/authorize`, post(auth)),
  // apps/server has no /cancel route yet (FRONTEND-REQUESTS.md R10); the 404 is shown as an error.
  cancel: (hash, sig) => request<{ txHash: Hex }>(`/api/invoices/${hash}/cancel`, post(sig)),
  listMerchantInvoices: async (address) =>
    (await request<{ items: ServerSummary[] }>(`/api/merchants/${address}/invoices`)).items.map(fromServer.summary),
  exportCsv: (address) => request<Blob>(`/api/merchants/${address}/export.csv`, {}, 'blob'),
  healthz: async () => fromServer.healthz(await request<ServerHealthz>('/healthz')),
};
