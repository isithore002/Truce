import type { Address, Hex } from "viem";
import type { BuyerAuth, InvoiceDoc } from "@truce/invoice-lib";

export type HealthReason = "NONE" | "LOW_BALANCE" | "AUTH_CANCELLED" | "AUTH_EXPIRING" | "BLOCKED";

/** What the web app and the API may learn about the deployment. */
export interface ChainPublicConfig {
  chainId: number;
  settler: Address;
  tokens: Address[];
  explorerBase: string;
}

/** Per-call context from the API layer. `clientKey` (usually the caller IP) feeds the rate limiter. */
export interface CallMeta {
  clientKey?: string;
}

export interface OnchainStatus {
  paid: boolean;
  refunded: bigint;
  payer?: Address;
  txHash?: Hex;
}

/** docs/INTERFACES.md section 7. The API and the scheduler talk to the chain only through this. */
export interface ChainModule {
  readonly config: ChainPublicConfig;
  /** Simulate, then send. Throws ChainError; a failing simulation sends nothing and costs nothing. */
  settle(doc: InvoiceDoc, auth: BuyerAuth, meta?: CallMeta): Promise<{ txHash: Hex }>;
  /** Snapshot (not a lock): could this authorization settle right now? */
  health(doc: InvoiceDoc, auth: BuyerAuth): Promise<{ ok: boolean; reason: HealthReason; balance: bigint }>;
  /** Relays the buyer's signed CancelAuthorization. */
  cancelAuthorization(from: Address, nonce: Hex, sig: { v: number; r: Hex; s: Hex }): Promise<{ txHash: Hex }>;
  onchainStatus(hash: Hex): Promise<OnchainStatus>;
  /** Settles due-date authorizations and refreshes health. Not part of T11/T11b. */
  startScheduler(): void;
}
