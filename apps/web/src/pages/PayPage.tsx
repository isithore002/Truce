import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useApp, useExampleFlag } from '../app/AppContext';
import { Icon } from '../components/Icon';
import { InvoiceCard } from '../components/invoice/InvoiceCard';
import { PayPanel } from '../components/pay/PayPanel';
import type { PayStep } from '../components/pay/PayProgress';
import { Receipt } from '../components/pay/Receipt';
import { OnchainStatus } from '../components/verify/OnchainStatus';
import { PinWarning } from '../components/verify/PinWarning';
import { useVerification, type Target } from '../components/verify/useVerification';
import { VerdictBanner } from '../components/verify/VerdictBanner';
import { VerificationChecklist } from '../components/verify/VerificationChecklist';
import { api, ApiError } from '../lib/api';
import type { Hex, InvoiceRecord, PayMode } from '../lib/api/types';
import { chain, config } from '../lib/config';
import { decodeDoc } from '../lib/doclink';
import { isHash } from '../lib/format';
import { invoiceLib } from '../lib/invoiceLib';
import { errorMessage, HEALTH_MESSAGES } from '../lib/messages';
import { payGate } from '../lib/payGate';
import { comparePin, savePin } from '../lib/pins';
import { signTypedData } from '../lib/wallet';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Buyer page: /pay/<hash> or /pay#doc=<base64url>. Verdict first; Pay only on PASS. */
export function PayPage() {
  const { hash } = useParams();
  const { hash: fragment } = useLocation();
  const app = useApp();

  const target = useMemo<Target | 'bad' | undefined>(() => {
    if (hash) return isHash(hash) ? { kind: 'hash', hash: hash as Hex } : 'bad';
    const m = fragment.match(/doc=([A-Za-z0-9_-]+)/);
    if (!m) return undefined;
    const doc = decodeDoc(m[1]!);
    return doc ? { kind: 'doc', doc } : 'bad';
  }, [hash, fragment]);

  const v = useVerification(typeof target === 'object' ? target : undefined);
  useExampleFlag(v.doc?.details.example);

  const [pinConfirmed, setPinConfirmed] = useState(false);
  const [mode, setMode] = useState<PayMode>('now');
  const [step, setStep] = useState<PayStep>('idle');
  const [error, setError] = useState<string>();
  const [paid, setPaid] = useState<InvoiceRecord>();
  const [cancelling, setCancelling] = useState(false);

  const doc = v.doc;
  const pin = useMemo(
    () => (doc ? comparePin(doc.domain, { signingAddress: doc.invoice.merchant, payout: doc.invoice.payout }) : undefined),
    // re-read after a payment saves a new pin
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, paid],
  );
  const record = paid ?? v.record;

  const gate = payGate({
    verify: v.verify, loading: v.loading, doc, status: record?.status, fromDocLink: target !== undefined && typeof target === 'object' && target.kind === 'doc',
    pin, pinConfirmed, account: app.wallet.address, settlerKnown: !!app.publicConfig?.settler,
  });

  async function pay() {
    if (!doc || typeof target !== 'object' || target.kind !== 'hash' || !gate.enabled) return;
    setError(undefined);
    const from = app.wallet.address ?? (await app.connect('buyer'));
    if (!from) return setError(app.wallet.error ?? 'Connect a wallet to pay.');
    if (!(await app.switchChain())) return setError('Switch your wallet to Whitechain Sepolia (chain 1874) to pay.');
    const settler = app.publicConfig!.settler;
    let failedAt: PayStep = 'signing';
    try {
      setStep('signing');
      const { typed, validAfter, validBefore } = invoiceLib.receiveWithAuthorizationTypedData({
        invoice: doc.invoice, invoiceHash: target.hash, from, settler, mode, chainId: app.publicConfig?.chainId ?? chain.id,
      });
      const sig = invoiceLib.splitSignature(await signTypedData(from, typed));
      failedAt = 'simulating';
      setStep('simulating');
      const res = await api.authorize(target.hash, { mode, from, validAfter, validBefore, ...sig });
      failedAt = 'sending';
      setStep('sending');
      let rec: InvoiceRecord | undefined;
      if (mode === 'due' || res.status === 'SCHEDULED_OK') {
        rec = await v.refresh();
      } else {
        for (let i = 0; i < 60; i++) {
          rec = await v.refresh();
          if (rec?.status === 'PAID') break;
          if (rec?.status === 'FAILED') throw new ApiError('SIMULATION_FAILED', errorMessage('SIMULATION_FAILED'));
          await sleep(1000);
        }
        if (rec?.status !== 'PAID') throw new ApiError('INTERNAL', 'The payment is taking longer than usual. Check the public record in a minute; do not sign again.');
      }
      savePin(doc.domain, { signingAddress: doc.invoice.merchant, payoutAddresses: [doc.invoice.payout] });
      setStep('confirmed');
      setPaid(rec);
      setPinConfirmed(false);
    } catch (e) {
      setStep(failedAt);
      setError(e instanceof ApiError ? errorMessage(e.code, e.message) : (e as Error).message);
    }
  }

  async function cancelScheduled() {
    if (!doc || typeof target !== 'object' || target.kind !== 'hash') return;
    setCancelling(true);
    setError(undefined);
    try {
      const from = app.wallet.address ?? (await app.connect('buyer'));
      if (!from || !(await app.switchChain())) throw new Error('Connect your wallet on Whitechain Sepolia to cancel.');
      const typed = invoiceLib.cancelAuthorizationTypedData({ token: doc.invoice.token, chainId: app.publicConfig?.chainId ?? chain.id, authorizer: from, nonce: target.hash });
      await api.cancel(target.hash, invoiceLib.splitSignature(await signTypedData(from, typed)));
      setPaid(await v.refresh());
      app.toast('Scheduled payment cancelled');
    } catch (e) {
      setError(e instanceof ApiError ? errorMessage(e.code, e.message) : (e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  if (target === undefined || target === 'bad') {
    return (
      <div className="wrap app-main">
        <div className="state" role="alert">
          <h1 style={{ fontSize: 'var(--t-h2)' }}>{target === 'bad' ? 'This payment link is damaged' : 'No invoice in this link'}</h1>
          <p className="muted">Ask the merchant to send the link again, or paste it on the verify page.</p>
          <a className="btn btn--primary" href="/verify">Check an invoice</a>
        </div>
      </div>
    );
  }

  if (v.error) {
    return (
      <div className="wrap app-main">
        <div className="state" role="alert">
          <h1 style={{ fontSize: 'var(--t-h2)' }}>We could not load this invoice</h1>
          <p className="muted">{v.error}</p>
          <button type="button" className="btn btn--secondary" onClick={v.retry}><Icon name="refresh" size={18} />Try again</button>
        </div>
      </div>
    );
  }

  const scheduled = record && ['SCHEDULED_OK', 'AT_RISK', 'FAILED'].includes(record.status);
  const showReceipt = record && (record.status === 'PAID' || (step === 'confirmed' && record.status === 'SCHEDULED_OK'));

  return (
    <div className="wrap app-main stack stack--lg">
      <VerdictBanner verify={v.verify} domain={doc?.domain} loading={v.loading} />
      <div className="split pay-split">
        <div className="stack stack--lg pay-main">
          {doc ? <InvoiceCard doc={doc} status={record?.status} overlay={record?.overlay} payoutBad={v.verify?.checks.some((c) => c.id === 'payout_in_domain_file' && !c.ok)} signerBad={v.verify?.checks.some((c) => c.id === 'merchant_matches_domain_file' && !c.ok)} /> : <div className="card skeleton" style={{ height: 480 }} aria-hidden="true" />}
          <VerificationChecklist checks={v.verify?.checks} domain={doc?.domain ?? 'the domain'} loading={v.loading} />
        </div>
        <div className="stack stack--lg sticky-col pay-side">
          {showReceipt ? (
            <Receipt record={record!} explorerUrl={app.publicConfig?.explorerUrl} />
          ) : (
            <>
              {doc && pin && v.verify?.result === 'PASS' && !scheduled && record?.status !== 'PAID' && (
                <PinWarning pin={pin} domain={doc.domain} confirmed={pinConfirmed} onConfirm={setPinConfirmed} />
              )}
              {!scheduled && <PayPanel
                gate={gate} amount={doc?.invoice.amount ?? '0'} dueDate={doc?.invoice.dueDate ?? '0'} mode={mode} onMode={setMode}
                dueDateFeature={config.features.dueDate} step={step} error={error} connected={!!app.wallet.address} onPay={pay}
              />}
            </>
          )}
          {scheduled && record && (
            <section className="card stack" aria-labelledby="sched-title">
              <h3 id="sched-title">Scheduled payment</h3>
              {record.status === 'AT_RISK' && (
                <div className="notice notice--warn" aria-live="polite"><Icon name="alert" /><p><strong>At risk.</strong> {HEALTH_MESSAGES[record.health?.reason ?? 'LOW_BALANCE']} Top up before the due date.</p></div>
              )}
              {record.status === 'FAILED' && (
                <div className="notice notice--bad" aria-live="polite"><Icon name="x" /><p><strong>Collection failed.</strong> {HEALTH_MESSAGES[record.health?.reason ?? 'LOW_BALANCE']} It retries automatically until the payment window closes.</p></div>
              )}
              {record.status === 'SCHEDULED_OK' && <p className="small">{HEALTH_MESSAGES.NONE}</p>}
              {error && <div className="notice notice--bad" role="alert"><Icon name="alert" /><p>{error}</p></div>}
              {config.features.dueDate && (
                <button type="button" className="btn btn--secondary" onClick={cancelScheduled} disabled={cancelling}>
                  {cancelling ? 'Waiting for your wallet…' : 'Cancel scheduled payment'}
                </button>
              )}
            </section>
          )}
          {target.kind === 'hash' && record && !showReceipt && <OnchainStatus record={record} stored />}
        </div>
      </div>
    </div>
  );
}
