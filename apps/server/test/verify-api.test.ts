import { describe, expect, it } from "vitest";
import { invoiceHash, toWire, type InvoiceDoc } from "@truce/invoice-lib";
import { setup } from "./appSetup.js";
import { ATTACKER_PAYOUT, SETTLER, attacker, buyer, ctx, makeAuth, makeDoc } from "./helpers.js";

type App = ReturnType<typeof setup>["app"];
const create = async (app: App, doc: InvoiceDoc) => (await app.inject({ method: "POST", url: "/api/invoices", payload: toWire(doc) })).json().hash as string;
const failed = (checks: { id: string; ok: boolean }[]) => checks.filter((c) => !c.ok).map((c) => c.id);

describe("GET /api/verify?hash=", () => {
  it("PASS for an honest stored invoice, with the on-chain status", async () => {
    const { app } = setup();
    const hash = await create(app, await makeDoc());
    const res = await app.inject({ method: "GET", url: `/api/verify?hash=${hash}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe("PASS");
    expect(body.checks).toHaveLength(10);
    expect(body.invoiceHash).toBe(hash);
    expect(body.domainFile.name).toBe("Northlight Design Studio");
    expect(body.onchain).toMatchObject({ paid: false, refunded: "0" });
  });

  it("applies the payer lock using ?buyer=", async () => {
    const { app } = setup();
    const hash = await create(app, await makeDoc({ payer: attacker.address }));
    const other = (await app.inject({ method: "GET", url: `/api/verify?hash=${hash}&buyer=${buyer.address}` })).json();
    expect(failed(other.checks)).toEqual(["payer_ok"]);
    const locked = (await app.inject({ method: "GET", url: `/api/verify?hash=${hash}&buyer=${attacker.address}` })).json();
    expect(locked.result).toBe("PASS");
  });

  it("needs a hash, and 404s for an unknown one", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/api/verify" })).statusCode).toBe(400);
    const unknown = await app.inject({ method: "GET", url: `/api/verify?hash=0x${"ab".repeat(32)}` });
    expect(unknown.statusCode).toBe(404);
  });

  it("brings our record in line when the invoice was paid straight on chain", async () => {
    const { app, chain } = setup();
    const doc = await makeDoc();
    const hash = await create(app, doc);
    await chain.settle(doc, await makeAuth(doc)); // paid outside our authorize endpoint
    const res = (await app.inject({ method: "GET", url: `/api/verify?hash=${hash}` })).json();
    expect(res.onchain).toMatchObject({ paid: true, payer: buyer.address });
    const inv = (await app.inject({ method: "GET", url: `/api/invoices/${hash}` })).json();
    expect(inv.status).toBe("PAID");
    expect(inv.events.map((e: { type: string }) => e.type)).toEqual(["created", "paid_onchain"]);
  });
});

describe("POST /api/verify (the hero case: a document someone hands the buyer)", () => {
  it("PASS for an honest document that was never stored", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/api/verify", payload: toWire(await makeDoc()) });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe("PASS");
  });

  it("FAIL for a swapped payout: the signature breaks and the wallet is not on the domain's list", async () => {
    const { app } = setup();
    const doc = await makeDoc();
    doc.invoice = { ...doc.invoice, payout: ATTACKER_PAYOUT };
    const res = (await app.inject({ method: "POST", url: "/api/verify", payload: toWire(doc) })).json();
    expect(res.result).toBe("FAIL");
    expect(failed(res.checks)).toEqual(["signature_valid", "payout_in_domain_file"]);
    const payoutCheck = res.checks.find((c: { id: string }) => c.id === "payout_in_domain_file");
    expect(payoutCheck.message).toMatch(/Do not pay this invoice/);
  });

  it("FAIL when the merchant domain publishes no file", async () => {
    const { app } = setup();
    const doc = await makeDoc();
    const res = (await app.inject({ method: "POST", url: "/api/verify", payload: { ...toWire(doc), domain: "unknown-shop.example" } })).json();
    expect(res.result).toBe("FAIL");
    expect(failed(res.checks)).toContain("domain_file_reachable");
  });

  it("returns FAIL (not an error) for a malformed document", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/api/verify", payload: { hello: "world" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe("FAIL");
    expect(res.json().checks[0]).toMatchObject({ id: "document_valid", ok: false });
  });

  it("shows paid status for a document whose invoice is already settled", async () => {
    const { app, chain } = setup();
    const doc = await makeDoc();
    await chain.settle(doc, await makeAuth(doc));
    const res = (await app.inject({ method: "POST", url: "/api/verify", payload: toWire(doc) })).json();
    expect(res.onchain.paid).toBe(true);
    expect(res.invoiceHash).toBe(invoiceHash(doc.invoice, { chainId: 1874, verifyingContract: SETTLER }));
    expect(ctx.verifyingContract).toBe(SETTLER);
  });

  it("is rate limited per caller", async () => {
    const { app } = setup();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await app.inject({ method: "POST", url: "/api/verify", payload: {} })).statusCode;
    expect(last).toBe(429);
  });
});
