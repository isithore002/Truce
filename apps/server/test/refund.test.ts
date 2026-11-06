import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { invoiceHash, refundNonce, signRefundAuthorization, toWire, type InvoiceDoc } from "@truce/invoice-lib";
import { setup } from "./appSetup.js";
import { AMOUNT, PAYOUT, SETTLER, T0, attacker, buyer, ctx, makeAuth, makeDoc, tokenCtx } from "./helpers.js";

// Public Anvil development key #3, which is the PAYOUT wallet used throughout these tests. Never holds real funds.
const payout = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");

type Env = ReturnType<typeof setup>;
const wire = (a: { from: string; validAfter: bigint; validBefore: bigint; v: number; r: string; s: string }, amount: bigint) => ({
  amount: amount.toString(), from: a.from, validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), v: a.v, r: a.r, s: a.s,
});

async function paidInvoice(env: Env) {
  const doc = await makeDoc();
  const hash = invoiceHash(doc.invoice, ctx);
  expect((await env.app.inject({ method: "POST", url: "/api/invoices", payload: toWire(doc) })).statusCode).toBe(201);
  expect((await env.app.inject({ method: "POST", url: `/api/invoices/${hash}/authorize`, payload: await authBody(doc) })).statusCode).toBe(200);
  return { doc, hash };
}
async function authBody(doc: InvoiceDoc) {
  const a = await makeAuth(doc);
  return { mode: a.mode, from: a.from, validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), v: a.v, r: a.r, s: a.s };
}
async function signRefund(hash: `0x${string}`, amount: bigint, refundedSoFar: bigint, signer = payout, signedAmount = amount) {
  const a = await signRefundAuthorization(signer, { settler: SETTLER, amount: signedAmount, nonce: refundNonce(hash, refundedSoFar), validBefore: T0 + 3600n }, tokenCtx);
  return wire(a, amount);
}
const post = (env: Env, hash: string, payload: unknown) => env.app.inject({ method: "POST", url: `/api/invoices/${hash}/refund`, payload: payload as object });

describe("the test payout key is the payout wallet", () => {
  it("matches", () => expect(payout.address).toBe(PAYOUT));
});

describe("POST /api/invoices/:hash/refund", () => {
  it("refunds part of a payment to the original payer only, then the rest, and records both", async () => {
    const env = setup();
    const { hash } = await paidInvoice(env);
    const payerBefore = env.chain.balanceOf(buyer.address);
    const payoutBefore = env.chain.balanceOf(PAYOUT);
    const attackerBefore = env.chain.balanceOf(attacker.address);

    const first = await post(env, hash, await signRefund(hash, 300_000_000n, 0n));
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: "REFUNDED", amount: "300000000", refunded: "300000000", remaining: (AMOUNT - 300_000_000n).toString() });
    expect(first.json().txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(env.chain.balanceOf(buyer.address)).toBe(payerBefore + 300_000_000n);
    expect(env.chain.balanceOf(PAYOUT)).toBe(payoutBefore - 300_000_000n);

    const rest = AMOUNT - 300_000_000n;
    const second = await post(env, hash, await signRefund(hash, rest, 300_000_000n));
    expect(second.statusCode).toBe(200);
    expect(second.json().remaining).toBe("0");
    expect(env.chain.balanceOf(attacker.address)).toBe(attackerBefore); // nobody else received anything

    const inv = (await env.app.inject({ method: "GET", url: `/api/invoices/${hash}` })).json();
    const refunds = inv.events.filter((e: { type: string }) => e.type === "refunded");
    expect(refunds.map((e: { detail: string }) => e.detail)).toEqual(["300000000", rest.toString()]);
    expect(inv.status).toBe("PAID");
  });

  it("rejects a refund above what is left, with the remaining amount in the error", async () => {
    const env = setup();
    const { hash } = await paidInvoice(env);
    const res = await post(env, hash, await signRefund(hash, AMOUNT + 1n, 0n));
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: "REFUND_EXCEEDS_PAID", details: { remaining: AMOUNT.toString() } });

    expect((await post(env, hash, await signRefund(hash, AMOUNT, 0n))).statusCode).toBe(200);
    const again = await post(env, hash, await signRefund(hash, 1n, AMOUNT));
    expect(again.statusCode).toBe(422);
    expect(again.json().error.code).toBe("REFUND_EXCEEDS_PAID");
  });

  it("refuses an unpaid or unknown invoice", async () => {
    const env = setup();
    const doc = await makeDoc();
    const hash = invoiceHash(doc.invoice, ctx);
    await env.app.inject({ method: "POST", url: "/api/invoices", payload: toWire(doc) });
    const unpaid = await post(env, hash, await signRefund(hash, 1n, 0n));
    expect(unpaid.statusCode).toBe(409);
    expect(unpaid.json().error.code).toBe("NOT_PAID");
    const unknown = await post(env, `0x${"ab".repeat(32)}`, await signRefund(`0x${"ab".repeat(32)}`, 1n, 0n));
    expect(unknown.statusCode).toBe(404);
  });

  it("only accepts a refund signed by the payout wallet", async () => {
    const env = setup();
    const { hash } = await paidInvoice(env);
    const buyerBefore = env.chain.balanceOf(buyer.address);
    // claims to be the payout wallet but is signed by someone else
    const forged = await signRefund(hash, 1_000n, 0n, attacker as never);
    const asPayout = { ...forged, from: PAYOUT };
    const r1 = await post(env, hash, asPayout);
    expect(r1.statusCode).toBe(422);
    expect(r1.json().error.code).toBe("AUTH_INVALID");
    // an honest signature from a wallet that is not the payout wallet
    const r2 = await post(env, hash, forged);
    expect(r2.statusCode).toBe(422);
    expect(r2.json().error.code).toBe("AUTH_INVALID");
    expect(env.chain.balanceOf(buyer.address)).toBe(buyerBefore);
  });

  it("rejects a signature for a different amount than the request says", async () => {
    const env = setup();
    const { hash } = await paidInvoice(env);
    const body = await signRefund(hash, 5_000_000n, 0n, payout, 1_000n); // signed 1,000, asks for 5,000,000
    const res = await post(env, hash, body);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("AUTH_INVALID");
  });

  it("does not let a used refund authorization be replayed", async () => {
    const env = setup();
    const { hash } = await paidInvoice(env);
    const body = await signRefund(hash, 100_000_000n, 0n);
    expect((await post(env, hash, body)).statusCode).toBe(200);
    const replay = await post(env, hash, body);
    expect(replay.statusCode).toBe(422);
    expect(replay.json().error.code).toBe("AUTH_INVALID");
    expect(env.chain.balanceOf(buyer.address) - 10_000_000_000n + AMOUNT).toBe(100_000_000n); // exactly one refund landed
  });

  it("rejects a zero amount and a malformed body", async () => {
    const env = setup();
    const { hash } = await paidInvoice(env);
    const zero = await post(env, hash, { ...(await signRefund(hash, 1n, 0n)), amount: "0" });
    expect(zero.statusCode).toBe(400);
    const bad = await post(env, hash, { amount: "10" });
    expect(bad.statusCode).toBe(400);
  });

  it("lets only one of two simultaneous refunds for the same invoice through", async () => {
    const env = setup({ latencyMs: 40 });
    const { hash } = await paidInvoice(env);
    const body = await signRefund(hash, 50_000_000n, 0n);
    const [a, b] = await Promise.all([post(env, hash, body), post(env, hash, body)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect([a, b].find((r) => r.statusCode === 409)!.json().error.code).toBe("DUPLICATE");
  });
});
