import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { invoiceHash, parseInvoiceDoc, signCancelAuthorization, signReceiveAuthorization, type PaymentMode } from "@truce/invoice-lib";
import { api, ApiFailure, type Config, type InvoiceView, type VerifyView } from "../api";
import { Checklist, ErrorNote, ExampleTag, InvoiceCard, Link, PinWarning, ScheduleStatus } from "../components";
import { checkPin, loadPins, recordPin, type PinMap } from "../pinning";
import { formatDateTime, formatUsdt, shortAddress } from "../format";
import { canScheduleDue } from "../schedule";
import { connect, currentAccount, ensureChain, tokenBalance, walletMessage, walletSigner } from "../wallet";

type Step = "idle" | "signing" | "sending" | "waiting" | "cancelling";

const storage = () => (typeof localStorage === "undefined" ? undefined : localStorage);

export default function Pay({ hash, config }: { hash: string; config?: Config }) {
  const [view, setView] = useState<InvoiceView | undefined>();
  const [verdict, setVerdict] = useState<VerifyView | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [account, setAccount] = useState<Address | undefined>();
  const [balance, setBalance] = useState<bigint | undefined>();
  const [step, setStep] = useState<Step>("idle");
  const [payError, setPayError] = useState<string | undefined>();
  const [ack, setAck] = useState(false);
  const [mode, setMode] = useState<PaymentMode>("now");
  const [pins, setPins] = useState<PinMap>(() => loadPins(storage()));

  const parsed = useMemo(() => (view ? parseInvoiceDoc(view.doc) : undefined), [view]);
  // The buyer's own browser recomputes the hash, so a server cannot hand over an invoice that does not match the link.
  const computedHash = useMemo<Hex | undefined>(
    () => (parsed?.ok && config ? invoiceHash(parsed.value.invoice, { chainId: config.chainId, verifyingContract: config.settler }) : undefined),
    [parsed, config],
  );
  const hashMismatch = computedHash !== undefined && computedHash.toLowerCase() !== hash.toLowerCase();

  const load = useCallback(
    async (buyer?: Address) => {
      try {
        const [v, check] = await Promise.all([api.invoice(hash), api.verifyHash(hash, buyer)]);
        setView(v);
        setVerdict(check);
        setLoadError(undefined);
      } catch (e) {
        setLoadError(e instanceof ApiFailure ? (e.code === "NOT_FOUND" ? "No invoice with this link was found." : e.message) : "Could not load the invoice.");
      }
    },
    [hash],
  );

  useEffect(() => {
    void load();
    currentAccount().then(setAccount, () => undefined);
  }, [load]);

  // When the buyer connects, re-check (the payer lock depends on who is paying) and read their balance.
  useEffect(() => {
    if (!account || !config) return;
    void load(account);
    void tokenBalance(config.tokens[0], account).then(setBalance);
  }, [account, config, load]);

  // A scheduled invoice changes by itself (health, collection), so keep it fresh.
  const scheduledNow = view?.status === "SCHEDULED_OK" || view?.status === "AT_RISK";
  useEffect(() => {
    if (!scheduledNow) return;
    const t = setInterval(() => void load(account), 10_000);
    return () => clearInterval(t);
  }, [scheduledNow, load, account]);

  // Once this browser's wallet is the one that paid, remember the merchant's wallets (key pinning).
  useEffect(() => {
    if (view?.status === "PAID" && view.payment && account && view.payment.payer.toLowerCase() === account.toLowerCase() && parsed?.ok) {
      recordPin(storage(), view.doc.domain, parsed.value.invoice, Math.floor(Date.now() / 1000));
    }
  }, [view, account, parsed]);

  async function onConnect() {
    setPayError(undefined);
    try {
      setAccount(await connect());
    } catch (e) {
      setPayError(walletMessage(e));
    }
  }

  async function waitForPaid(): Promise<boolean> {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const v = await api.invoice(hash).catch(() => undefined);
      if (v?.status === "PAID") {
        await load(account);
        return true;
      }
    }
    setPayError("The payment was sent but is not confirmed yet. Refresh this page in a moment to see it.");
    return false;
  }

  async function onPay() {
    if (!account || !config || !parsed?.ok || !computedHash) return;
    setPayError(undefined);
    try {
      setStep("signing");
      await ensureChain();
      const auth = await signReceiveAuthorization(
        walletSigner(account),
        { settler: config.settler, invoice: parsed.value.invoice, invoiceHash: computedHash, mode },
        { chainId: config.chainId, token: parsed.value.invoice.token },
      );
      setStep("sending");
      const res = await api.authorize(hash, {
        mode: auth.mode,
        from: auth.from,
        validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(),
        v: auth.v,
        r: auth.r,
        s: auth.s,
      });
      let paidNow = res.status === "PAID";
      if (res.status === "PENDING") {
        setStep("waiting");
        paidNow = await waitForPaid();
      } else await load(account);
      if (paidNow) {
        // Remember this merchant's wallets so a later change is flagged.
        recordPin(localStorage, view!.doc.domain, parsed.value.invoice, Math.floor(Date.now() / 1000));
        setPins(loadPins(localStorage));
      }
    } catch (e) {
      setPayError(e instanceof ApiFailure ? e.message : walletMessage(e));
    } finally {
      setStep("idle");
    }
  }

  async function onCancel() {
    if (!account || !config || !parsed?.ok || !computedHash) return;
    setPayError(undefined);
    try {
      setStep("cancelling");
      await ensureChain();
      const sig = await signCancelAuthorization(walletSigner(account), computedHash, { chainId: config.chainId, token: parsed.value.invoice.token });
      await api.cancel(hash, sig);
      await load(account);
    } catch (e) {
      setPayError(e instanceof ApiFailure ? e.message : walletMessage(e));
    } finally {
      setStep("idle");
    }
  }

  if (loadError) return <ErrorNote>{loadError} <Link to="/verify">Check another invoice</Link></ErrorNote>;
  if (!view || !verdict || !parsed) return <p className="muted">Loading the invoice…</p>;
  if (!parsed.ok) return <ErrorNote>This invoice is damaged and cannot be paid.</ErrorNote>;

  const inv = parsed.value.invoice;
  const nowSec = Math.floor(Date.now() / 1000);
  const paid = view.status === "PAID";
  const expired = view.status === "EXPIRED";
  const settled = view.status === "SCHEDULED_OK" || view.status === "AT_RISK" || view.status === "FAILED" || view.status === "CANCELLED";
  const dueAvailable = canScheduleDue(inv.dueDate, nowSec);
  const effectiveMode: PaymentMode = mode === "due" && dueAvailable ? "due" : "now";
  const lowBalance = balance !== undefined && balance < inv.amount;
  const pin = checkPin(pins, view.doc.domain, inv);
  const needsAck = pin.status === "changed" && !ack;
  const canPay = verdict.result === "PASS" && !needsAck && !hashMismatch && !paid && !expired && !!account && !lowBalance && step === "idle";
  const busyLabel =
    step === "signing" ? "Confirm in your wallet…" : step === "sending" ? (effectiveMode === "due" ? "Scheduling…" : "Sending the payment…") : step === "waiting" ? "Waiting for confirmation…" : undefined;
  const actionLabel = effectiveMode === "due" ? `Schedule ${formatUsdt(inv.amount)} for ${formatDateTime(inv.dueDate)}` : `Pay ${formatUsdt(inv.amount)}`;
  const canCancel = !!account && step === "idle";

  return (
    <>
      <h1>Pay invoice {view.doc.details.example && <ExampleTag />}</h1>
      <Checklist verdict={verdict} domain={view.doc.domain} />
      {hashMismatch && <ErrorNote>This invoice does not match its link. Do not pay it.</ErrorNote>}
      {!paid && <PinWarning pin={pin} domain={view.doc.domain} invoice={inv} ack={ack} onAck={setAck} />}
      <InvoiceCard doc={view.doc} />

      {paid ? (
        <section className="card receipt">
          <h2>Paid</h2>
          <p>
            {formatUsdt(inv.amount)} was paid{view.payment ? ` by ${shortAddress(view.payment.payer)} on ${formatDateTime(view.payment.paidAt)}` : ""}.
          </p>
          {view.payment?.txHash && config && (
            <p>
              <a href={`${config.explorerBase}/tx/${view.payment.txHash}`} target="_blank" rel="noreferrer">
                View the transaction on the explorer
              </a>
            </p>
          )}
          <p className="muted">
            Anyone can confirm this on the <Link to={`/verify?hash=${hash}`}>public verify page</Link>.
          </p>
        </section>
      ) : settled ? (
        <>
          <ScheduleStatus status={view.status} collectAt={view.schedule?.validAfter} healthReason={view.health?.reason} nowSec={nowSec} canCancel={canCancel} onCancel={() => void onCancel()} cancelBusy={step === "cancelling"} />
          {!account && (view.status === "SCHEDULED_OK" || view.status === "AT_RISK") && (
            <button className="button secondary" onClick={() => void onConnect()}>
              Connect the paying wallet to cancel
            </button>
          )}
          {payError && <ErrorNote>{payError}</ErrorNote>}
        </>
      ) : expired ? (
        <ErrorNote>This invoice has expired and can no longer be paid. Ask the merchant for a new one.</ErrorNote>
      ) : (
        <section className="card pay">
          <h2>{effectiveMode === "due" ? `Pay ${formatUsdt(inv.amount)} on the due date` : `Pay ${formatUsdt(inv.amount)}`}</h2>
          {dueAvailable && (
            <div className="mode-choice" role="radiogroup" aria-label="When to pay">
              <label>
                <input type="radio" name="mode" checked={effectiveMode === "now"} onChange={() => setMode("now")} /> Pay now
              </label>
              <label>
                <input type="radio" name="mode" checked={effectiveMode === "due"} onChange={() => setMode("due")} /> Pay on the due date, {formatDateTime(inv.dueDate)}
              </label>
            </div>
          )}
          <ul className="signing">
            <li>You sign <strong>one</strong> payment authorization. You pay no gas: the relayer does.</li>
            <li>
              The Truce payment contract (<span className="mono">{shortAddress(config?.settler ?? "")}</span>) checks the merchant's signature and sends the money only to{" "}
              <span className="mono">{shortAddress(inv.payout)}</span>.
            </li>
            {effectiveMode === "due" ? (
              <li>
                Nothing moves today. We collect on the due date if your balance covers it. This is a commitment, not locked funds, and the balance check is a snapshot, not a lock. You can cancel any time before then.
              </li>
            ) : (
              <li>Your authorization is a commitment, not locked funds. It is valid until {formatDateTime(inv.expiry)}.</li>
            )}
          </ul>
          {!account ? (
            <button className="button" onClick={() => void onConnect()}>
              Connect wallet
            </button>
          ) : (
            <>
              <p className="muted">
                Connected: <span className="mono">{account}</span>
                {balance !== undefined && ` · balance ${formatUsdt(balance)}`}
              </p>
              {lowBalance && <ErrorNote>Your wallet holds {formatUsdt(balance!)}, but this invoice needs {formatUsdt(inv.amount)}.</ErrorNote>}
              <button className="button big" onClick={() => void onPay()} disabled={!canPay}>
                {busyLabel ?? (verdict.result === "FAIL" ? "Cannot pay: checks failed" : needsAck ? "Confirm the new wallets first" : actionLabel)}
              </button>
            </>
          )}
          {payError && <ErrorNote>{payError}</ErrorNote>}
        </section>
      )}
    </>
  );
}
