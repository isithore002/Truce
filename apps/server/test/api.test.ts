import { describe, expect, it } from "vitest";
import { toWire, type InvoiceDoc } from "@truce/invoice-lib";
import { buildApp } from "../src/api/app.js";
import { MockChain } from "../src/chain/mock.js";
import { JsonStore } from "../src/shared/store.js";
import { ATTACKER_PAYOUT, DOMAIN, PAYOUT, SETTLER, T0, attacker, merchant, makeDoc } from "./helpers.js";

export const domainFile = {
  version: 1,
  name: "Northlight Design Studio",
  signingAddress: merchant.address,
  payoutAddresses: [PAYOUT],
  chainIds: [1874],
};

export function setup(opts: { latencyMs?: number } = {}) {
  let t = Number(T0);
  const chain = new MockChain({ settler: SETTLER, now: () => BigInt(t), latencyMs: opts.latencyMs });
  const store = new JsonStore(undefined, () => t);
  const app = buildApp({ chain, store, resolveDomain: async (d) => (d === DOMAIN ? domainFile : null), now: () => t, exampleMode: true });
  return { app, chain, store, set: (v: number) => (t = v), advance: (s: number) => (t += s) };
}

const post = (app: ReturnType<typeof setup>["app"], doc: InvoiceDoc) => app.inject({ method: "POST", url: "/api/invoices", payload: toWire(doc) });

describe("config", () => {
  it("returns the deployment and the example-mode flag", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/api/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ chainId: 1874, settler: SETTLER, exampleMode: true });
    expect(res.json().tokens).toHaveLength(1);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("create, get and list", () => {
  it("creates an invoice, returns a pay link, and serves it back", async () => {
    const { app } = setup();
    const doc = await makeDoc();
    const res = await post(app, doc);
    expect(res.statusCode).toBe(201);
    const { hash, link } = res.json();
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(link).toBe(`http://localhost:5173/pay/${hash}`);

    const got = await app.inject({ method: "GET", url: `/api/invoices/${hash}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ status: "ISSUED", doc: { domain: DOMAIN } });
    expect(got.json().events[0].type).toBe("created");
    expect(got.json().doc.invoice.amount).toBe(doc.invoice.amount.toString());
  });

  it("lists a merchant's invoices with summaries", async () => {
    const { app } = setup();
    await post(app, await makeDoc());
    await post(app, await makeDoc());
    const res = await app.inject({ method: "GET", url: `/api/merchants/${merchant.address.toLowerCase()}/invoices` });
    expect(res.statusCode).toBe(200);
    const { items } = res.json();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ clientName: "Beta Labs", status: "ISSUED", example: true });
    const other = await app.inject({ method: "GET", url: `/api/merchants/${attacker.address}/invoices` });
    expect(other.json().items).toEqual([]);
  });

  it("rejects a duplicate with 409", async () => {
    const { app } = setup();
    const doc = await makeDoc();
    expect((await post(app, doc)).statusCode).toBe(201);
    const again = await post(app, doc);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("DUPLICATE");
  });

  it("rejects a document edited after signing (swapped payout) with SIGNATURE_INVALID", async () => {
    const { app } = setup();
    const doc = await makeDoc();
    doc.invoice = { ...doc.invoice, payout: ATTACKER_PAYOUT };
    const res = await post(app, doc);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("SIGNATURE_INVALID");
  });

  it("rejects a token the contract does not accept, and an expired invoice", async () => {
    const { app } = setup();
    const badToken = await makeDoc({ token: "0xaa79000000000000000000000000000000008f46" });
    expect((await post(app, badToken)).json().error.code).toBe("TOKEN_NOT_ALLOWED");
    const expired = await makeDoc({ expiry: T0 - 1n });
    const res = await post(app, expired);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("EXPIRED");
  });

  it("rejects malformed input with the standard error shape", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/api/invoices", payload: { version: 1, invoice: { amount: 5 } } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "INVALID_DOCUMENT", message: expect.any(String) } });
    const bad = await app.inject({ method: "POST", url: "/api/invoices", headers: { "content-type": "application/json" }, payload: "{nope" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("INVALID_DOCUMENT");
  });

  it("rejects an oversized body", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/api/invoices", payload: { junk: "x".repeat(70_000) } });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("INVALID_DOCUMENT");
  });

  it("returns 404 for an unknown or malformed hash and for unknown routes", async () => {
    const { app } = setup();
    const unknown = await app.inject({ method: "GET", url: `/api/invoices/0x${"ab".repeat(32)}` });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("NOT_FOUND");
    const malformed = await app.inject({ method: "GET", url: "/api/invoices/not-a-hash" });
    expect(malformed.statusCode).toBe(400);
    const route = await app.inject({ method: "GET", url: "/api/nope" });
    expect(route.statusCode).toBe(404);
    expect(route.json().error.code).toBe("NOT_FOUND");
  });

  it("reports an unpaid invoice past its expiry as EXPIRED without rewriting it", async () => {
    const { app, set } = setup();
    const doc = await makeDoc();
    const { hash } = (await post(app, doc)).json();
    set(Number(doc.invoice.expiry) + 1);
    expect((await app.inject({ method: "GET", url: `/api/invoices/${hash}` })).json().status).toBe("EXPIRED");
    const list = await app.inject({ method: "GET", url: `/api/merchants/${merchant.address}/invoices` });
    expect(list.json().items[0].status).toBe("EXPIRED");
  });

  it("answers CORS preflight", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "OPTIONS", url: "/api/invoices" });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });
});
