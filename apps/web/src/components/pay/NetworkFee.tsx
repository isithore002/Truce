import { useEffect, useState } from 'react';
import { EXPLORER } from '../../lib/config';
import { formatWbtFine } from '../../lib/format';
import { feePayer, fetchTxCost, type TxCost } from '../../lib/relayerFee';

/**
 * "Network fee" row for the receipt: who paid the gas and how much, read from the explorer for this transaction.
 * Renders nothing until the explorer answers (and nothing at all in mock mode, where the hash is not on chain).
 * The text says only what the transaction shows: it never claims "free", and the USD value is left out on purpose.
 */
export function NetworkFee({ txHash, payer, explorerUrl }: { txHash: string; payer?: string; explorerUrl?: string }) {
  const [cost, setCost] = useState<TxCost>();
  useEffect(() => {
    const ctrl = new AbortController();
    void fetchTxCost(explorerUrl ?? EXPLORER, txHash, ctrl.signal).then((c) => {
      if (!ctrl.signal.aborted) setCost(c);
    });
    return () => ctrl.abort();
  }, [txHash, explorerUrl]);

  if (!cost) return null;
  const who = feePayer(cost, payer);
  return (
    <>
      <dt>Network fee</dt>
      <dd data-testid="network-fee">
        {formatWbtFine(cost.feeWei)}, paid by {who === 'relayer' ? 'the relayer' : 'the buyer’s own wallet'}
        {who === 'relayer' && <span className="small muted"> · the buyer sent no transaction and paid no gas</span>}
      </dd>
    </>
  );
}
