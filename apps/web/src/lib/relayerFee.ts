/**
 * What a settlement cost in gas and who paid it, read from the public explorer (Blockscout API v2) for the
 * transaction hash on the receipt. Nothing here comes from our server, and nothing is estimated: the fee is
 * the explorer's own `fee.value` (execution fee plus the L1 data fee, in wei of WBT).
 */
export interface TxCost {
  /** Account that sent the transaction (the relayer for a Truce settlement). */
  from: string;
  /** Total fee in wei of WBT. */
  feeWei: bigint;
}

const isAddr = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

/** Reads the two fields we need; returns undefined for anything that does not look like a finished transaction. */
export function parseExplorerTx(json: unknown): TxCost | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const t = json as { from?: { hash?: unknown }; fee?: { type?: unknown; value?: unknown } };
  const from = t.from?.hash;
  const value = t.fee?.value;
  if (!isAddr(from) || typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  if (t.fee?.type !== 'actual') return undefined; // pending or estimated fees are not shown as a cost
  return { from, feeWei: BigInt(value) };
}

/** Best effort: any network or format problem gives undefined and the receipt simply omits the line. */
export async function fetchTxCost(explorerBase: string, txHash: string, signal?: AbortSignal): Promise<TxCost | undefined> {
  try {
    const res = await fetch(`${explorerBase.replace(/\/+$/, '')}/api/v2/transactions/${txHash}`, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    return parseExplorerTx(await res.json());
  } catch {
    return undefined;
  }
}

export type FeePayer = 'relayer' | 'buyer';

/** Who paid, judged from the transaction itself: the sender either is the paying wallet or is somebody else. */
export function feePayer(cost: TxCost, payer: string | undefined): FeePayer {
  return payer && cost.from.toLowerCase() === payer.toLowerCase() ? 'buyer' : 'relayer';
}
