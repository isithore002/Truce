import type {
  Address, ApiErrorBody, BuyerAuth, CancelSig, CreateInvoiceResult, Healthz, Hex, InvoiceDoc, InvoiceRecord,
  InvoiceSummary, PublicConfig, Status, VerifyResponse,
} from './types';
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
  authorize(hash: Hex, auth: BuyerAuth): Promise<{ status: Status }>;
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

export const httpApi: TruceApi = {
  mode: 'server',
  getConfig: () => request<PublicConfig>('/api/config'),
  createInvoice: (doc) => request<CreateInvoiceResult>('/api/invoices', post(doc)),
  getInvoice: async (hash) => ({ hash, ...(await request<Omit<InvoiceRecord, 'hash'>>(`/api/invoices/${hash}`)) }),
  verifyHash: (hash) => request<VerifyResponse>(`/api/verify?hash=${encodeURIComponent(hash)}`),
  verifyDoc: (doc) => request<VerifyResponse>('/api/verify', post(doc)),
  authorize: (hash, auth) => request<{ status: Status }>(`/api/invoices/${hash}/authorize`, post(auth)),
  cancel: (hash, sig) => request<{ txHash: Hex }>(`/api/invoices/${hash}/cancel`, post(sig)),
  listMerchantInvoices: (address) => request<InvoiceSummary[]>(`/api/merchants/${address}/invoices`),
  exportCsv: (address) => request<Blob>(`/api/merchants/${address}/export.csv`, {}, 'blob'),
  healthz: () => request<Healthz>('/healthz'),
};
