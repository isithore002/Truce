import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { invoiceHash, parseInvoiceDoc, signReceiveAuthorization } from "@truce/invoice-lib";
import { api, ApiFailure, type Config, type InvoiceView, type VerifyView } from "../api";
import { Checklist, ErrorNote, ExampleTag, InvoiceCard, Link } from "../components";
import { formatDateTime, formatUsdt, shortAddress } from "../format";
import { connect, currentAccount, ensureChain, tokenBalance, walletMessage, walletSigner } from "../wallet";

type Step = "idle" | "signing" | "sending" | "waiting";

export default function Pay({ hash, config }: { hash: string; config?: Config }) {
  const [view, setView] = useState<InvoiceView | undefined>();
  const [verdict, setVerdict] = useState<VerifyView | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [account, setAccount] = useState<Address | undefined>();
  const [balance, setBalance] = useState<bigint | undefined>();
  const [step, setStep] = useState<Step>("idle");
  const [payError, setPayError] = useState<string | undefined>();

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

  async function onConnect() {
    setPayError(undefined);
    try {
      setAccount(await connect());
    } catch (e) {
      setPayError(walletMessage(e));
    }
  }

  async function waitForPaid() {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const v = await api.invoice(hash).catch(() => undefined);
      if (v?.status === "PAID") return void (await load(account));
    }
    setPayError("The payment was sent but is not confirmed yet. Refresh this page in a moment to see it.");
  }

  async function onPay() {
    if (!account || !config || !parsed?.ok || !computedHash) return;
    setPayError(undefined);
    try {
      setStep("signing");
      await ensureChain();
      const auth = await signReceiveAuthorization(
        walletSigner(account),
        { settler: config.settler, invoice: parsed.value.invoice, invoiceHash: computedHash, mode: "now" },
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
      if (res.status === "PENDING") {
        setStep("waiting");
        await waitForPaid();
      } else await load(account);
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
  const paid = view.status === "PAID";
  const expired = view.status === "EXPIRED";
  const lowBalance = balance !== undefined && balance < inv.amount;
  const canPay = verdict.result === "PASS" && !hashMismatch && !paid && !expired && !!account && !lowBalance && step === "idle";
  const busyLabel = step === "signing" ? "Confirm in your wallet…" : step === "sending" ? "Sending the payment…" : step === "waiting" ? "Waiting for confirmation…" : undefined;

  return (
    <>
      <h1>
        Pay invoice {view.doc.details.example && <ExampleTag />}
      </h1>
      <Checklist verdict={verdict} domain={view.doc.domain} />
      {hashMismatch && <ErrorNote>This invoice does not match its link. Do not pay it.</ErrorNote>}
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
      ) : expired ? (
        <ErrorNote>This invoice has expired and can no longer be paid. Ask the merchant for a new one.</ErrorNote>
      ) : (
        <section className="card pay">
          <h2>Pay {formatUsdt(inv.amount)}</h2>
          <ul className="signing">
            <li>You sign <strong>one</strong> payment authorization. You pay no gas: the relayer does.</li>
            <li>
              The Truce payment contract (<span className="mono">{shortAddress(config?.settler ?? "")}</span>) checks the merchant's signature and sends the money only to{" "}
              <span className="mono">{shortAddress(inv.payout)}</span>.
            </li>
            <li>Your authorization is a commitment, not locked funds. It is valid until {formatDateTime(inv.expiry)}.</li>
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
                {busyLabel ?? (verdict.result === "FAIL" ? "Cannot pay: checks failed" : `Pay ${formatUsdt(inv.amount)}`)}
              </button>
            </>
          )}
          {payError && <ErrorNote>{payError}</ErrorNote>}
        </section>
      )}
    </>
  );
}
