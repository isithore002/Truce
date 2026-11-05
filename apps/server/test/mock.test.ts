import { describe, expect, it } from "vitest";
import { invoiceHash, signCancelAuthorization, signInvoice } from "@truce/invoice-lib";
import { ChainError } from "../src/chain/errors.js";
import { MockChain } from "../src/chain/mock.js";
import { AMOUNT, ATTACKER_PAYOUT, PAYOUT, T0, attacker, buyer, ctx, makeAuth, makeDoc, tokenCtx } from "./helpers.js";

function chain(over: { now?: () => bigint } = {}) {
  let t = T0;
  const c = new MockChain({ settler: ctx.verifyingContract, now: over.now ?? (() => t) });
  return { c, advance: (s: bigint) => (t += s), set: (v: bigint) => (t = v) };
}

async function rejects(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => undefined,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ChainError);
  expect((err as ChainError).code).toBe(code);
}

describe("MockChain.settle", () => {
  it("pays the signed payout exactly once and records the payment", async () => {
    const { c } = chain();
    const doc = await makeDoc();
    const before = c.balanceOf(PAYOUT);
    const { txHash } = await c.settle(doc, await makeAuth(doc));
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(c.balanceOf(PAYOUT)).toBe(before + AMOUNT);
    const status = await c.onchainStatus(invoiceHash(doc.invoice, ctx));
    expect(status).toMatchObject({ paid: true, payer: buyer.address, txHash });
  });

  it("swapped payout is rejected and nothing moves (the hero failure)", async () => {
    const { c } = chain();
    const doc = await makeDoc();
    const auth = await makeAuth(doc);
    const swapped = { ...doc, invoice: { ...doc.invoice, payout: ATTACKER_PAYOUT } };
    await rejects(c.settle(swapped, auth), "SIGNATURE_INVALID");
    expect(c.balanceOf(ATTACKER_PAYOUT)).toBe(10_000_000_000n); // untouched default
    expect((await c.onchainStatus(invoiceHash(doc.invoice, ctx))).paid).toBe(false);
  });

  it("tampered amount and a wrong merchant signer are rejected", async () => {
    const { c } = chain();
    const doc = await makeDoc();
    await rejects(c.settle({ ...doc, invoice: { ...doc.invoice, amount: AMOUNT * 2n } }, await makeAuth(doc)), "SIGNATURE_INVALID");
    const other = await makeDoc();
    await rejects(c.settle({ ...other, signature: await signInvoice(attacker, other.invoice, ctx) }, await makeAuth(other)), "SIGNATURE_INVALID");
  });

  it("rejects a second settlement of the same invoice", async () => {
    const { c } = chain();
    const doc = await makeDoc();
    const auth = await makeAuth(doc);
    await c.settle(doc, auth);
    await rejects(c.settle(doc, auth), "ALREADY_PAID");
  });

  it("rejects an expired invoice", async () => {
    const { c, set } = chain();
    const doc = await makeDoc();
    const auth = await makeAuth(doc);
    set(doc.invoice.expiry + 1n);
    await rejects(c.settle(doc, auth), "EXPIRED");
  });

  it("enforces the payer lock", async () => {
    const { c } = chain();
    const doc = await makeDoc({ payer: attacker.address });
    await rejects(c.settle(doc, await makeAuth(doc)), "WRONG_PAYER");
    expect((await c.settle(doc, await makeAuth(doc, "now", attacker))).txHash).toBeDefined();
  });

  it("rejects a token the settler does not accept", async () => {
    const { c } = chain();
    const doc = await makeDoc({ token: "0xaa79000000000000000000000000000000008f46" });
    await rejects(c.settle(doc, await makeAuth(doc)), "TOKEN_NOT_ALLOWED");
  });

  it("rejects an empty buyer balance with INSUFFICIENT_BALANCE", async () => {
    const { c } = chain();
    c.setBalance(buyer.address, 0n);
    const doc = await makeDoc();
    await rejects(c.settle(doc, await makeAuth(doc)), "INSUFFICIENT_BALANCE");
  });

  it("due-date mode: not valid before the due date, valid after", async () => {
    const { c, set } = chain();
    const doc = await makeDoc();
    const auth = await makeAuth(doc, "due");
    await rejects(c.settle(doc, auth), "AUTH_INVALID");
    set(doc.invoice.dueDate + 1n);
    expect((await c.settle(doc, auth)).txHash).toBeDefined();
  });

  it("rejects an authorization signed by someone other than the stated buyer", async () => {
    const { c } = chain();
    const doc = await makeDoc();
    const forged = { ...(await makeAuth(doc, "now", attacker)), from: buyer.address };
    await rejects(c.settle(doc, forged), "AUTH_INVALID");
  });

  it("failNextSettle scripts one failure, then recovers", async () => {
    const { c } = chain();
    const doc = await makeDoc();
    const auth = await makeAuth(doc);
    c.failNextSettle(new ChainError("RELAYER_BUDGET_EXHAUSTED", "budget"));
    await rejects(c.settle(doc, auth), "RELAYER_BUDGET_EXHAUSTED");
    expect((await c.settle(doc, auth)).txHash).toBeDefined();
  });
});

describe("MockChain.health and cancelAuthorization", () => {
  it("reports NONE, LOW_BALANCE, BLOCKED and AUTH_EXPIRING as a snapshot", async () => {
    const { c, set } = chain();
    const doc = await makeDoc();
    const auth = await makeAuth(doc);
    expect(await c.health(doc, auth)).toMatchObject({ ok: true, reason: "NONE" });
    c.setBalance(buyer.address, AMOUNT - 1n);
    expect(await c.health(doc, auth)).toMatchObject({ ok: false, reason: "LOW_BALANCE" });
    c.setBalance(buyer.address, AMOUNT);
    c.setBlocked(buyer.address);
    expect((await c.health(doc, auth)).reason).toBe("BLOCKED");
    c.setBlocked(buyer.address, false);
    set(auth.validBefore - 60n);
    expect((await c.health(doc, auth)).reason).toBe("AUTH_EXPIRING");
  });

  it("a signed cancellation blocks the authorization", async () => {
    const { c } = chain();
    const doc = await makeDoc();
    const auth = await makeAuth(doc);
    const hash = invoiceHash(doc.invoice, ctx);
    await c.cancelAuthorization(buyer.address, hash, await signCancelAuthorization(buyer, hash, tokenCtx));
    expect((await c.health(doc, auth)).reason).toBe("AUTH_CANCELLED");
    await rejects(c.settle(doc, auth), "AUTH_INVALID");
  });

  it("a cancellation signed by someone else is rejected", async () => {
    const { c } = chain();
    const hash = invoiceHash((await makeDoc()).invoice, ctx);
    await rejects(c.cancelAuthorization(buyer.address, hash, await signCancelAuthorization(attacker, hash, tokenCtx)), "AUTH_INVALID");
  });
});
