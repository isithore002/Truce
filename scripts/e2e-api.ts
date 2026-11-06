// HTTP-level end to end: drives a RUNNING Truce server the way the web app will.
//
//   npm run server                      (terminal 1: mock chain, DEMO_DOMAINS=1)   or  CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server
//   npm run e2e:api                     (terminal 2)
//
// Flow: create a signed invoice -> verify (PASS) -> a swapped-payout copy is refused and FAILS verification
// -> the buyer authorizes once -> the relayer settles -> status, receipt link, CSV -> a capped refund of 20% to the buyer.
// With a mock server nothing touches the chain. With CHAIN_MODE=testnet it makes one real 0.01 USDT payment and one refund.
// Needs MERCHANT_PK and PAYER_PK (throwaway testnet keys, see .env.example). Keys are never printed.
// The merchant key must be the wallet listed in fixtures/domains/northlight-design.example.json.

import { randomBytes } from "node:crypto";
import { pad, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  TRACK_USDT,
  domainHash,
  invoiceHash,
  memoHash,
  refundNonce,
  signInvoice,
  signRefundAuthorization,
  signReceiveAuthorization,
  toWire,
  type Invoice,
  type InvoiceDetails,
  type InvoiceDoc,
} from "@truce/invoice-lib";

const API = (process.env.API_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const DOMAIN = "northlight-design.example";
const AMOUNT = BigInt(process.env.AMOUNT_UNITS || "10000"); // 0.01 USDT

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
  return { status: res.status, json, text };
}

function expect(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!ok) throw new Error(`Check failed: ${label}`);
}

async function main() {
  const merchant = privateKeyToAccount(key("MERCHANT_PK"));
  const buyer = privateKeyToAccount(key("PAYER_PK"));

  const health = await call("GET", "/healthz");
  expect("server is up", health.status === 200 && health.json?.ok === true, `mode ${health.json?.mode}, ${health.json?.store?.invoices} invoices`);
  const config = (await call("GET", "/api/config")).json;
  const ctx = { chainId: config.chainId as number, verifyingContract: config.settler as Hex };
  expect("config", config.chainId === 1874 && config.tokens.length === 1, `settler ${config.settler}`);

  const details: InvoiceDetails = {
    merchantName: "Northlight Design Studio",
    clientName: "Beta Labs",
    lineItems: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: AMOUNT.toString() }],
    notes: "EXAMPLE DATA. Net 30, time-compressed for the demo.",
    example: true,
  };
  const now = BigInt(Math.floor(Date.now() / 1000));
  const invoice: Invoice = {
    invoiceId: pad(toHex(randomBytes(16)), { size: 32 }),
    merchant: merchant.address,
    payout: merchant.address,
    token: TRACK_USDT,
    amount: AMOUNT,
    dueDate: now,
    expiry: now + 86_400n,
    payer: "0x0000000000000000000000000000000000000000",
    domainHash: domainHash(DOMAIN),
    memoHash: memoHash(details),
  };
  const doc: InvoiceDoc = { version: 1, invoice, signature: await signInvoice(merchant, invoice, ctx), domain: DOMAIN, details };
  const hash = invoiceHash(invoice, ctx);

  // 1. The merchant creates the invoice
  const created = await call("POST", "/api/invoices", toWire(doc));
  expect("merchant creates the invoice", created.status === 201 && created.json.hash === hash, created.json?.link);

  // 2. The buyer app verifies it
  const verified = await call("GET", `/api/verify?hash=${hash}&buyer=${buyer.address}`);
  expect("buyer check: PASS, all ten checks", verified.json?.result === "PASS" && verified.json.checks.length === 10, verified.json?.checks?.filter((c: any) => !c.ok).map((c: any) => c.id).join(", "));

  // 3. The hero moment: someone swaps the payout wallet in the copy the buyer receives
  const attacker = privateKeyToAccount(("0x" + randomBytes(32).toString("hex")) as Hex).address;
  const swapped = toWire({ ...doc, invoice: { ...invoice, payout: attacker } });
  const swappedVerdict = await call("POST", "/api/verify", swapped);
  const failedIds = swappedVerdict.json?.checks?.filter((c: any) => !c.ok).map((c: any) => c.id) ?? [];
  expect("swapped payout FAILS in the app", swappedVerdict.json?.result === "FAIL" && failedIds.includes("signature_valid") && failedIds.includes("payout_in_domain_file"), failedIds.join(", "));
  const swappedCreate = await call("POST", "/api/invoices", swapped);
  expect("the server refuses to store the swapped invoice", swappedCreate.status === 422 && swappedCreate.json?.error?.code === "SIGNATURE_INVALID");

  // 4. The buyer signs once; the relayer settles
  const auth = await signReceiveAuthorization(buyer, { settler: ctx.verifyingContract, invoice, invoiceHash: hash, mode: "now" }, { chainId: ctx.chainId, token: TRACK_USDT });
  const paid = await call("POST", `/api/invoices/${hash}/authorize`, {
    mode: auth.mode,
    from: auth.from,
    validAfter: auth.validAfter.toString(),
    validBefore: auth.validBefore.toString(),
    v: auth.v,
    r: auth.r,
    s: auth.s,
  });
  expect("buyer pays with one signature (relayer pays gas)", paid.status === 200 && paid.json?.status === "PAID", paid.json?.txHash ? `${config.explorerBase}/tx/${paid.json.txHash}` : paid.text);

  // 5. Status, public verify page data, accountant CSV
  const inv = (await call("GET", `/api/invoices/${hash}`)).json;
  expect("invoice status is PAID with the audit trail", inv.status === "PAID" && inv.events.some((e: any) => e.type === "paid"), inv.events.map((e: any) => e.type).join(" > "));
  const after = (await call("GET", `/api/verify?hash=${hash}`)).json;
  expect("public verify page: PASS and settled on chain", after.result === "PASS" && after.onchain.paid === true, `payer ${after.onchain.payer}`);
  const csv = await call("GET", `/api/merchants/${merchant.address}/export.csv`);
  expect("CSV export has this invoice", csv.status === 200 && csv.text.includes(hash), `${csv.text.trim().split("\r\n").length - 1} row(s)`);
  const again = await call("POST", `/api/invoices/${hash}/authorize`, { mode: "now", from: auth.from, validAfter: "0", validBefore: auth.validBefore.toString(), v: auth.v, r: auth.r, s: auth.s });
  expect("a second payment is refused", again.status === 409 && again.json?.error?.code === "ALREADY_PAID");

  // 6. Capped refund through the API: the payout wallet (here the merchant) signs, the relayer pays the gas, the contract pays only the buyer
  const refundAmount = AMOUNT / 5n; // 20% of the payment
  const refundCall = async (amount: bigint, refundedSoFar: bigint) => {
    const m = await signRefundAuthorization(merchant, { settler: ctx.verifyingContract, amount, nonce: refundNonce(hash, refundedSoFar), validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600) }, { chainId: ctx.chainId, token: TRACK_USDT });
    return call("POST", `/api/invoices/${hash}/refund`, { amount: amount.toString(), from: m.from, validAfter: m.validAfter.toString(), validBefore: m.validBefore.toString(), v: m.v, r: m.r, s: m.s });
  };
  const refunded = await refundCall(refundAmount, 0n);
  expect("payout wallet refunds part of it; the relayer pays the gas", refunded.status === 200 && refunded.json?.status === "REFUNDED" && refunded.json?.refunded === refundAmount.toString(), refunded.json?.txHash ? `${config.explorerBase}/tx/${refunded.json.txHash}` : refunded.text);
  const afterRefund = (await call("GET", `/api/verify?hash=${hash}`)).json;
  expect("the chain shows the refunded amount", afterRefund.onchain?.refunded === refundAmount.toString(), `refunded ${afterRefund.onchain?.refunded} of ${AMOUNT}`);
  const tooMuch = await refundCall(AMOUNT, refundAmount); // more than what is left
  expect("a refund above what is left is refused", tooMuch.status === 422 && tooMuch.json?.error?.code === "REFUND_EXCEEDS_PAID", tooMuch.json?.error?.code ?? tooMuch.text);

  console.log("\nOK: the API behaves end to end.");
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
