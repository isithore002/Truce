import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { invoiceHash, signInvoice, toWire, type InvoiceDoc } from "@truce/invoice-lib";
import { api, ApiFailure, type Config, type InvoiceSummary } from "../api";
import { ErrorNote, ExampleTag, InvoiceTable, Link, SoulBadge } from "../components";
import { formatUsdt } from "../format";
import {
  EMPTY_FORM,
  EXAMPLE_FORM,
  EXAMPLE_SETTINGS,
  checkForm,
  domainFileText,
  formTotal,
  loadSettings,
  saveSettings,
  type InvoiceForm,
  type MerchantSettings,
} from "../merchantLogic";
import { connect, currentAccount, ensureChain, walletMessage, walletSigner } from "../wallet";

const store = () => (typeof localStorage === "undefined" ? undefined : localStorage);

export default function Merchant({ config }: { config?: Config }) {
  const example = !!config?.exampleMode;
  const [account, setAccount] = useState<Address | undefined>();
  const [settings, setSettings] = useState<MerchantSettings>(() => loadSettings(store(), { domain: "", businessName: "", payout: "" }));
  const [form, setForm] = useState<InvoiceForm>(EMPTY_FORM);
  const [items, setItems] = useState<InvoiceSummary[] | undefined>();
  const [created, setCreated] = useState<{ link: string; hash: string } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | undefined>();

  // In example mode, start from the fictional Northlight merchant so the demo needs no typing.
  useEffect(() => {
    if (!example) return;
    setSettings((s) => (s.domain ? s : EXAMPLE_SETTINGS));
    setForm((f) => (f.clientName ? f : EXAMPLE_FORM));
  }, [example]);

  useEffect(() => {
    currentAccount().then(setAccount, () => undefined);
  }, []);

  useEffect(() => saveSettings(store(), settings), [settings]);

  const refresh = useCallback(async () => {
    if (!account) return;
    try {
      setItems((await api.merchantInvoices(account)).items);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Could not load your invoices.");
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const total = useMemo(() => formTotal(form.lines), [form.lines]);
  const fileText = useMemo(() => (account ? domainFileText(settings, account) : ""), [settings, account]);

  async function onConnect() {
    setError(undefined);
    try {
      setAccount(await connect());
    } catch (e) {
      setError(walletMessage(e));
    }
  }

  async function onCreate() {
    if (!account || !config) return;
    setError(undefined);
    setCreated(undefined);
    setBusy(true);
    try {
      const { invoice, details } = checkForm(form, settings, account, example);
      await ensureChain();
      const ctx = { chainId: config.chainId, verifyingContract: config.settler };
      const signature = await signInvoice(walletSigner(account) as never, invoice, ctx);
      const doc: InvoiceDoc = { version: 1, invoice, signature, domain: settings.domain.trim().toLowerCase(), details };
      const res = await api.createInvoice(toWire(doc));
      if (res.hash.toLowerCase() !== invoiceHash(invoice, ctx).toLowerCase()) throw new Error("The server returned a different invoice than the one you signed.");
      setCreated(res);
      setForm({ ...(example ? EXAMPLE_FORM : EMPTY_FORM) });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : e instanceof Error && !("code" in e) ? e.message : walletMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCollect(hash: string) {
    setError(undefined);
    try {
      await api.collect(hash);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Could not trigger the collection.");
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(undefined), 1500);
    } catch {
      setError("Copy did not work in this browser. Select the text and copy it by hand.");
    }
  }

  const setLine = (i: number, patch: Partial<InvoiceForm["lines"][number]>) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  return (
    <>
      <h1>Merchant {example && <ExampleTag />}</h1>
      <p className="lead">Publish which wallets you use, sign invoices with your wallet, and see which ones are paid. Your clients check every invoice against your published list before they pay.</p>

      {!account ? (
        <section className="card">
          <h2>Connect your signing wallet</h2>
          <p>This wallet signs your invoices. Funds are paid to your payout wallet, which can be the same one.</p>
          <button className="button" onClick={() => void onConnect()}>
            Connect wallet
          </button>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>1. Your business and the file you publish</h2>
            <p className="muted">
              Signing wallet: <span className="mono">{account}</span> <SoulBadge address={account} exampleMode={example} />
            </p>
            <div className="form-grid">
              <label>
                <span className="label">Your website domain</span>
                <input type="text" value={settings.domain} placeholder="yourbusiness.com" onChange={(e) => setSettings({ ...settings, domain: e.target.value })} />
              </label>
              <label>
                <span className="label">Business name</span>
                <input type="text" value={settings.businessName} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} />
              </label>
              <label>
                <span className="label">Payout wallet (blank = same as signing wallet)</span>
                <input type="text" value={settings.payout} placeholder="0x…" onChange={(e) => setSettings({ ...settings, payout: e.target.value })} />
              </label>
            </div>
            <p>
              Publish this at <span className="mono">https://{settings.domain || "yourbusiness.com"}/.well-known/truce.json</span>. Clients compare every invoice with it.
            </p>
            <pre className="file" data-testid="domain-file">
              {fileText}
            </pre>
            <button className="button secondary" onClick={() => void copy("file", fileText)}>
              {copied === "file" ? "Copied" : "Copy file"}
            </button>
            {example && <p className="hint">Example mode: the demo server already serves a file for northlight-design.example, so nothing needs publishing.</p>}
          </section>

          <section className="card">
            <h2>2. Create an invoice</h2>
            <div className="form-grid">
              <label>
                <span className="label">Client name</span>
                <input type="text" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </label>
              <label>
                <span className="label">Due date (blank = on receipt)</span>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label>
                <span className="label">Or due in … minutes (demo, time-compressed)</span>
                <input type="number" min={1} value={form.dueInMinutes} placeholder="for example 2" onChange={(e) => setForm({ ...form, dueInMinutes: e.target.value })} />
              </label>
              <label>
                <span className="label">Payable for (days after due)</span>
                <input type="number" min={1} max={365} value={form.validDays} onChange={(e) => setForm({ ...form, validDays: e.target.value })} />
              </label>
              <label>
                <span className="label">Only this wallet may pay (optional)</span>
                <input type="text" value={form.payer} placeholder="0x…" onChange={(e) => setForm({ ...form, payer: e.target.value })} />
              </label>
            </div>
            <h3>Line items (USDT)</h3>
            {form.lines.map((l, i) => (
              <div className="line-row" key={i}>
                <input type="text" aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <input type="text" aria-label="Quantity" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input type="text" aria-label="Unit price" placeholder="Unit price" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                <button className="button secondary" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            ))}
            <button className="button secondary" onClick={() => setForm({ ...form, lines: [...form.lines, { description: "", quantity: "1", unitPrice: "" }] })}>
              Add a line
            </button>
            <label>
              <span className="label" style={{ marginTop: "0.8rem" }}>
                Notes
              </span>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <p className="total">Total: {total === undefined ? "complete every line" : formatUsdt(total)}</p>
            <button className="button big" disabled={busy || !config} onClick={() => void onCreate()}>
              {busy ? "Confirm in your wallet…" : "Sign and create invoice"}
            </button>
            <p className="hint">You sign once with your wallet. Signing costs no gas.</p>
            {error && <ErrorNote>{error}</ErrorNote>}
            {created && (
              <div className="card receipt" data-testid="created">
                <h2>Invoice created</h2>
                <p>Send this link to your client:</p>
                <p className="mono wallet">{created.link}</p>
                <div className="row">
                  <button className="button" onClick={() => void copy("link", created.link)}>
                    {copied === "link" ? "Copied" : "Copy link"}
                  </button>
                  <Link to={`/verify?hash=${created.hash}`} className="button secondary">
                    Check it as a client would
                  </Link>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <h2>3. Your invoices</h2>
            <div className="row">
              <button className="button secondary" onClick={() => void refresh()}>
                Refresh
              </button>
              <a className="button secondary" href={api.csvUrl(account)} download>
                Download CSV
              </a>
            </div>
            {items === undefined ? <p className="muted">Loading…</p> : <InvoiceTable items={items} explorerBase={config?.explorerBase ?? ""} onCollect={(h) => void onCollect(h)} />}
          </section>
        </>
      )}
      {!account && error && <ErrorNote>{error}</ErrorNote>}
    </>
  );
}
