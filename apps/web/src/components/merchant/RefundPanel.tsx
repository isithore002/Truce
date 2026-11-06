import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../../app/AppContext';
import { api, ApiError } from '../../lib/api';
import type { Address, InvoiceRecord } from '../../lib/api/types';
import { chain } from '../../lib/config';
import { formatUsdt, nowSeconds, sameAddress } from '../../lib/format';
import { invoiceLib } from '../../lib/invoiceLib';
import { errorMessage } from '../../lib/messages';
import { parseRefundAmount, REFUND_VALID_SECONDS, refundOverlay, remainingToRefund } from '../../lib/refund';
import { isMockWallet, signTypedData } from '../../lib/wallet';
import { AddressChip } from '../invoice/AddressChip';
import { StatusBadge } from '../invoice/StatusBadge';

/**
 * Refund a paid invoice, in full or in part. The payout wallet signs; the relayer pays the gas; the contract sends the money
 * only to the wallet that paid and refuses anything above what is left. This panel cannot choose a recipient.
 */
export function RefundPanel({ record, onRefunded }: { record: InvoiceRecord; onRefunded: () => void }) {
  const app = useApp();
  const { hash } = record;
  const inv = record.doc.invoice;
  const [refunded, setRefunded] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  // undefined means the merchant has not typed: the field then offers everything that is left.
  const [typed, setTyped] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<{ txHash?: string; pending: boolean }>();

  // What was already refunded is read from the chain (through the public verify route), never remembered in the browser.
  const read = useCallback(
    () =>
      api.verifyHash(hash).then(
        (v) => {
          if (v.onchain?.unavailable) return setLoadError('The chain could not be read just now. Try again in a moment.');
          setLoadError(undefined);
          setRefunded(v.onchain?.refunded ?? '0');
        },
        (e: Error) => setLoadError(e.message),
      ),
    [hash],
  );
  useEffect(() => {
    void read();
  }, [read]);

  const remaining = refunded === undefined ? undefined : remainingToRefund(inv.amount, refunded);
  const overlay = refunded === undefined ? undefined : refundOverlay(inv.amount, refunded);
  const mock = isMockWallet();
  const isPayoutWallet = mock || (!!app.wallet.address && sameAddress(app.wallet.address, inv.payout));

  const amount = typed ?? (remaining !== undefined && remaining > 0n ? formatUsdt(remaining).replace(/,/g, '') : '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSent(undefined);
    if (remaining === undefined || refunded === undefined) return;
    const parsed = parseRefundAmount(amount, remaining);
    if (!parsed.ok) return setError(parsed.error);
    const cfg = app.publicConfig;
    if (!cfg) return setError('Server settings are not loaded yet. Try again in a moment.');
    setBusy(true);
    try {
      const from: Address = mock ? inv.payout : (app.wallet.address as Address);
      if (!(await app.switchChain())) throw new Error('Switch your wallet to Whitechain Sepolia (chain 1874).');
      const signed = await invoiceLib.signRefund({
        payout: from, settler: cfg.settler, token: inv.token, chainId: cfg.chainId ?? chain.id, hash,
        amount: parsed.value, refundedSoFar: BigInt(refunded), validBefore: BigInt(nowSeconds() + REFUND_VALID_SECONDS),
        sign: (typed) => signTypedData(from, typed),
      });
      const res = await api.refund(hash, {
        amount: parsed.value.toString(), from: signed.from, validAfter: signed.validAfter.toString(), validBefore: signed.validBefore.toString(),
        v: signed.v, r: signed.r, s: signed.s,
      });
      setSent({ txHash: res.txHash, pending: res.status === 'PENDING' });
      setTyped(undefined);
      app.toast(res.status === 'PENDING' ? 'Refund sent, waiting for confirmation' : 'Refund sent');
      await read();
      onRefunded();
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err.code, err.message) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="refund-title">
      <div className="row row--between">
        <h3 id="refund-title">Refund</h3>
        {overlay && <StatusBadge status="PAID" overlay={overlay} />}
      </div>

      {loadError && (
        <div className="stack stack--sm">
          <p className="field-error" role="alert">{loadError}</p>
          <button type="button" className="btn btn--secondary" onClick={() => void read()}>Try again</button>
        </div>
      )}
      {!loadError && refunded === undefined && <div className="skeleton" style={{ height: 96 }} aria-hidden="true" />}

      {remaining !== undefined && refunded !== undefined && (
        <>
          <dl className="kv">
            <dt>Paid</dt><dd>{formatUsdt(inv.amount)} USDT</dd>
            <dt>Refunded so far</dt><dd>{formatUsdt(refunded)} USDT</dd>
            <dt>Left to refund</dt><dd data-testid="refund-left">{formatUsdt(remaining)} USDT</dd>
            <dt>Goes to</dt><dd>{record.tx?.payer ? <AddressChip value={record.tx.payer} /> : 'the wallet that paid'}</dd>
          </dl>

          {remaining === 0n ? (
            <p className="small">This invoice is fully refunded.</p>
          ) : !isPayoutWallet ? (
            <div className="stack stack--sm">
              <p className="small">A refund is signed by the invoice's payout wallet <AddressChip value={inv.payout} />. {app.wallet.address ? 'Switch your wallet to that account.' : 'Connect it to refund.'}</p>
              {!app.wallet.address && <button type="button" className="btn btn--secondary" onClick={() => void app.connect('merchant')}>Connect wallet</button>}
            </div>
          ) : (
            <form className="stack stack--sm" onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="refund-amount">Amount to refund (USDT)</label>
                <input id="refund-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setTyped(e.target.value)} aria-invalid={!!error} autoComplete="off" />
              </div>
              <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Follow your wallet…' : 'Sign and send refund'}</button>
              <p className="small muted">
                You sign once with the payout wallet; the relayer pays the gas. The money goes only to the wallet that paid, and the contract refuses more than is left. The payout wallet must hold the USDT.
              </p>
            </form>
          )}
        </>
      )}

      {error && <div className="notice notice--bad" role="alert"><p>{error}</p></div>}
      {sent && (
        <output className="small" style={{ display: 'block' }}>
          {sent.pending ? 'The refund was sent but is not confirmed yet. Check the public record in a minute; do not sign again.' : 'Refund confirmed.'}{' '}
          {sent.txHash && <AddressChip value={sent.txHash} kind="tx" />}
        </output>
      )}
    </section>
  );
}
