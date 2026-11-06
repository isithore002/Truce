import type { Address, Hex, InvoiceDoc, Status } from './types';

/**
 * Response shapes exactly as apps/server sends them (src/api/routes.ts, status.ts, chain/types.ts).
 * Only client.ts reads these; it maps them onto the UI shapes in types.ts.
 */

export interface ServerConfig {
  chainId: number;
  settler: Address;
  tokens: Address[];
  explorerBase: string;
  exampleMode: boolean;
}

export interface ServerEvent {
  /** unix seconds */
  at: number;
  type: string;
  detail?: string;
  txHash?: Hex;
}

export interface ServerInvoice {
  doc: InvoiceDoc;
  status: Status;
  health?: { reason: string; checkedAt: number };
  payment?: { payer: Address; paidAt: number; txHash?: Hex };
  schedule?: { validAfter: string; validBefore: string };
  events: ServerEvent[];
}

export interface ServerSummary {
  hash: Hex;
  invoiceId: Hex;
  merchantName: string;
  clientName: string;
  amount: string;
  token: Address;
  dueDate: string;
  expiry: string;
  status: Status;
  txHash?: Hex;
  paidAt?: number;
  createdAt: number;
  example: boolean;
}

/** POST /authorize: 200 { status: "PAID", txHash } or 202 { status: "PENDING", txHash? } */
export interface ServerAuthorize {
  status: 'PAID' | 'PENDING';
  txHash?: Hex;
}

export interface ServerHealthz {
  ok: boolean;
  mode?: 'mock' | 'testnet';
  rpc?: { chainId: number; blockNumber?: string; lagSeconds?: number };
  relayer?: { address: Address; wbtBalance: string };
  store?: { invoices: number };
  error?: string;
}
