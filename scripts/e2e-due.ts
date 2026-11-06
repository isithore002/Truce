// HTTP-level check of pay-on-the-due-date against a RUNNING server (use CHAIN_MODE=testnet for the real thing).
//
//   CHAIN_MODE=testnet DEMO_DOMAINS=1 PORT=8788 npm run server        (terminal 1)
//   API_URL=http://127.0.0.1:8788 npm run e2e:due                      (terminal 2)
//
// Invoice A: scheduled to be due in about 70 seconds, then collected automatically by the scheduler.
// Invoice B: scheduled, then the buyer signs a CancelAuthorization that the relayer submits; it is never collected.
// Each payment is 0.01 USDT. Needs MERCHANT_PK (the Northlight fixture wallet) and PAYER_PK in .env (throwaway testnet keys).

import { randomBytes } from "node:crypto";
import { pad, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TRACK_USDT, buildInvoice, invoiceHash, signCancelAuthorization, signInvoice, signReceiveAuthorization, toWire, type InvoiceDoc } from "@truce/invoice-lib";

const API = (process.env.API_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const DUE_IN = Number(process.env.DUE_IN_SECONDS || "70");

function key(name: string): Hex {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} is missing or not a 32-byte hex private key (see .env.example)`);
  return v as Hex;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
}

function expect(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!ok) throw new Error(`Check failed: ${label}`);
}

async function main() {
  const merchant = privateKeyToAccount(key("MERCHANT_PK"));
  const buyer = privateKeyToAccount(key("PAYER_PK"));
  const config = (await call("GET", "/api/config")).json;
  const ctx = { chainId: config.chainId as number, verifyingContract: config.settler as Hex };
  const tokenCtx = { chainId: ctx.chainId, token: TRACK_USDT };
  expect("server is up", config.chainId === 1874, `settler ${config.settler}`);

  async function schedule(label: string) {
    const now = Math.floor(Date.now() / 1000);
    const { invoice, details } = buildInvoice({
      merchant: merchant.address,
      domain: "northlight-design.example",
      merchantName: "Northlight Design Studio",
      clientName: "Beta Labs",
      lineItems: [{ description: `${label} (EXAMPLE DATA)`, quantity: "1", unitPrice: "0.01" }],
      notes: "EXAMPLE DATA. Net 30, time-compressed for the demo.",
      dueDate: now + DUE_IN,
      validDays: 1,
      example: true,
      invoiceId: pad(toHex(randomBytes(16)), { size: 32 }),
    });
    const doc: InvoiceDoc = { version: 1, invoice, signature: await signInvoice(merchant, invoice, ctx), domain: "northlight-design.example", details };
    const hash = invoiceHash(invoice, ctx);
    const created = await call("POST", "/api/invoices", toWire(doc));
    expect(`${label}: merchant creates the invoice`, created.status === 201 && created.json.hash === hash);
    const a = await signReceiveAuthorization(buyer, { settler: ctx.verifyingContract, invoice, invoiceHash: hash, mode: "due" }, tokenCtx);
    const res = await call("POST", `/api/invoices/${hash}/authorize`, { mode: "due", from: a.from, validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), v: a.v, r: a.r, s: a.s });
    expect(`${label}: buyer signs once, scheduled for the due date`, res.status === 200 && res.json.status === "SCHEDULED_OK", res.json?.collectAt ? `collect at ${new Date(Number(res.json.collectAt) * 1000).toISOString()}` : JSON.stringify(res.json));
    const h = await call("GET", `/api/invoices/${hash}/health`);
    expect(`${label}: health snapshot is OK`, h.json?.health?.ok === true, h.json?.health?.note);
    return { hash, invoice };
  }

  const a = await schedule("Invoice A (will be collected)");
  const b = await schedule("Invoice B (will be cancelled)");

  // B: the buyer cancels. The relayer submits the signed CancelAuthorization and pays the gas.
  const sig = await signCancelAuthorization(buyer, b.hash, tokenCtx);
  const cancelled = await call("POST", `/api/invoices/${b.hash}/cancel`, sig);
  expect("Invoice B: buyer cancels, relayer submits the cancellation", cancelled.status === 200 && cancelled.json.status === "CANCELLED", `${config.explorerBase}/tx/${cancelled.json?.txHash}`);

  // A: wait for the scheduler.
  console.log(`\nWaiting for the scheduler to collect invoice A (due in about ${DUE_IN} s)...`);
  const deadline = Date.now() + (DUE_IN + 150) * 1000;
  let status = "";
  let tx = "";
  while (Date.now() < deadline) {
    const r = await call("GET", `/api/invoices/${a.hash}`);
    status = r.json?.status;
    if (status === "PAID") {
      tx = r.json.payment.txHash;
      break;
    }
    if (status === "FAILED") throw new Error(`Invoice A failed: ${JSON.stringify(r.json.events.at(-1))}`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  expect("Invoice A: collected automatically on the due date", status === "PAID", `${config.explorerBase}/tx/${tx}`);
  const bNow = await call("GET", `/api/invoices/${b.hash}`);
  expect("Invoice B: still cancelled, never collected", bNow.json.status === "CANCELLED");
  console.log("\nOK: due-date collection and buyer cancel both work.");
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
