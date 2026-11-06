import { describe, expect, it } from "vitest";
import { toWire, type BuyerAuth, type InvoiceDoc } from "@truce/invoice-lib";
import { ChainError } from "../src/chain/errors.js";
import { invoicesToCsv, csvCell, CSV_COLUMNS } from "../src/api/csv.js";
import { setup } from "./appSetup.js";
import { AMOUNT, PAYOUT, T0, attacker, buyer, makeAuth, makeDoc, merchant } from "./helpers.js";

type Env = ReturnType<typeof setup>;
const create = async (app: Env["app"], doc: InvoiceDoc) => (await app.inject({ method: "POST", url: "/api/invoices", payload: toWire(doc) })).json().hash as string;
const wire = (a: BuyerAuth) => ({ mode: a.mode, from: a.from, validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), v: a.v, r: a.r, s: a.s });
const authorize = (app: Env["app"], hash: string, a: BuyerAuth | object) => app.inject({ method: "POST", url: `/api/invoices/${hash}/authorize`, payload: "mode" in a && "validAfter" in a && typeof (a as BuyerAuth).validAfter === "bigint" ? wire(a as BuyerAuth) : a });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("POST /api/invoices/:hash/authorize (pay now)", () => {
  it("settles through the chain module, records the payment and the audit trail", async () => {
    const { app, chain } = setup();
    const doc = await makeDoc();
    const hash = await create(app, doc);
    const before = chain.balanceOf(PAYOUT);

    const res = await authorize(app, hash, await makeAuth(doc));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "PAID" });
    expect(res.json().txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.balanceOf(PAYOUT)).toBe(before + AMOUNT);

    const inv = (await app.inject({ method: "GET", url: `/api/invoices/${hash}` })).json();
    expect(inv.status).toBe("PAID");
    expect(inv.payment).toMatchObject({ payer: buyer.address, txHash: res.json().txHash });
    expect(inv.events.map((e: { type: string }) => e.type)).toEqual(["created", "authorized", "paid"]);

    const list = (await app.inject({ method: "GET", url: `/api/merchants/${merchant.address}/invoices` })).json().items[0];
    expect(list).toMatchObject({ status: "PAID", txHash: res.json().txHash });
  });

  it("refuses a second payment of a paid invoice", async () => {
    const { app } = setup();
    const doc = await makeDoc();
    const hash = await create(app, doc);
    const auth = await makeAuth(doc);
    expect((await authorize(app, hash, auth)).statusCode).toBe(200);
    const again = await authorize(app, hash, auth);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("ALREADY_PAID");
  });

  it("rejects an authorization signed for a different invoice (nonce mismatch) and keeps the invoice payable", async () => {
    const { app, chain } = setup();
    const doc = await makeDoc();
    const other = await makeDoc();
    const hash = await create(app, doc);
    const res = await authorize(app, hash, await makeAuth(other)); // buyer signed for another invoice
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("AUTH_INVALID");
    const inv = (await app.inject({ method: "GET", url: `/api/invoices/${hash}` })).json();
    expect(inv.status).toBe("ISSUED");
    expect(inv.events.at(-1)).toMatchObject({ type: "settle_failed", detail: "AUTH_INVALID" });
    expect(chain.balanceOf(PAYOUT)).toBe(10_000_000_000n);
    expect((await authorize(app, hash, await makeAuth(doc))).statusCode).toBe(200); // the right one still works
  });

  it("maps chain failures to the API error codes", async () => {
    const cases: [string, number, ChainError][] = [
      ["INSUFFICIENT_BALANCE", 422, new ChainError("INSUFFICIENT_BALANCE", "low")],
      ["RELAYER_BUDGET_EXHAUSTED", 503, new ChainError("RELAYER_BUDGET_EXHAUSTED", "budget")],
      ["RATE_LIMITED", 429, new ChainError("RATE_LIMITED", "slow")],
      ["SIMULATION_FAILED", 422, new ChainError("SIMULATION_FAILED", "would fail")],
    ];
    for (const [code, status, err] of cases) {
      const { app, chain } = setup();
      const doc = await makeDoc();
      const hash = await create(app, doc);
      chain.failNextSettle(err);
      const res = await authorize(app, hash, await makeAuth(doc));
      expect(res.statusCode, code).toBe(status);
      expect(res.json().error.code).toBe(code);
    }
  });

  it("reports an empty buyer wallet as INSUFFICIENT_BALANCE", async () => {
    const { app, chain } = setup();
    chain.setBalance(buyer.address, 0n);
    const doc = await makeDoc();
    const hash = await create(app, doc);
    const res = await authorize(app, hash, await makeAuth(doc));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("enforces the payer lock with 403", async () => {
    const { app } = setup();
    const doc = await makeDoc({ payer: attacker.address });
    const hash = await create(app, doc);
    const res = await authorize(app, hash, await makeAuth(doc));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("WRONG_PAYER");
  });

  it("answers 410 for an expired invoice, 404 for an unknown one, 400 for a bad body", async () => {
    const { app, set } = setup();
    const doc = await makeDoc();
    const hash = await create(app, doc);
    const auth = await makeAuth(doc);
    expect((await authorize(app, hash, { ...wire(auth), v: 5 })).statusCode).toBe(400);
    expect((await authorize(app, `0x${"cd".repeat(32)}`, auth)).statusCode).toBe(404);
    set(Number(doc.invoice.expiry) + 1);
    const expired = await authorize(app, hash, auth);
    expect(expired.statusCode).toBe(410);
    expect(expired.json().error.code).toBe("EXPIRED");
  });

  it("answers 202 PENDING when confirmation is slow, blocks a double submit, then records the payment", async () => {
    const { app } = setup({ latencyMs: 150, authorizeWaitMs: 20 });
    const doc = await makeDoc();
    const hash = await create(app, doc);
    const auth = await makeAuth(doc);

    const first = await authorize(app, hash, auth);
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ status: "PENDING" });

    const second = await authorize(app, hash, auth);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("DUPLICATE");

    await sleep(300);
    const inv = (await app.inject({ method: "GET", url: `/api/invoices/${hash}` })).json();
    expect(inv.status).toBe("PAID");
  });
});

describe("CSV export", () => {
  it("serves the accountant CSV with a row per invoice and a link to the transaction", async () => {
    const { app } = setup();
    const doc = await makeDoc();
    const hash = await create(app, doc);
    const paid = await authorize(app, hash, await makeAuth(doc));
    await create(app, await makeDoc());

    const res = await app.inject({ method: "GET", url: `/api/merchants/${merchant.address}/export.csv` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="truce-invoices-[0-9a-f]{8}\.csv"$/);
    const lines = res.body.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
    const paidRow = lines.find((l) => l.includes(",PAID,"))!;
    expect(paidRow).toContain("Northlight Design Studio");
    expect(paidRow).toContain("1250,USDT");
    expect(paidRow).toContain(`https://explorer.testnet.whitechain.io/tx/${paid.json().txHash}`);
    expect(paidRow).toContain(",yes");
    expect(lines.filter((l) => l.includes(",ISSUED,"))).toHaveLength(1);
  });

  it("returns just the header for a merchant with no invoices", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: `/api/merchants/${attacker.address}/export.csv` });
    expect(res.body.replace(/^﻿/, "").trim()).toBe(CSV_COLUMNS.join(","));
  });

  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    for (const evil of ["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tx", "\rx"]) expect(csvCell(evil).startsWith("'") || csvCell(evil).startsWith(`"'`), evil).toBe(true);
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(1250)).toBe("1250");
  });

  it("keeps a malicious client name from becoming a formula or breaking the row", async () => {
    const doc = await makeDoc();
    const wireDoc = toWire(doc);
    wireDoc.details = { ...wireDoc.details, clientName: '=HYPERLINK("http://evil","x"),extra' };
    const csv = invoicesToCsv([{ hash: "0x" + "ab".repeat(32), doc: wireDoc, status: "ISSUED", events: [], createdAt: Number(T0) } as never], { now: Number(T0), explorerBase: "https://e" });
    const row = csv.replace(/^﻿/, "").split("\r\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""http://evil"",""x""),extra"`);
    expect(row.split(",").length).toBeGreaterThan(CSV_COLUMNS.length); // the comma inside the quoted cell did not add a column outside quotes
  });
});

describe("GET /healthz", () => {
  it("reports the chain, relayer and store", async () => {
    const { app } = setup();
    await create(app, await makeDoc());
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, mode: "mock", rpc: { chainId: 1874 }, store: { invoices: 1 } });
    expect(res.json().relayer.wbtBalance).toMatch(/^\d+$/);
  });

  it("answers 503 when the chain cannot be reached", async () => {
    const { app, chain } = setup();
    chain.status = async () => {
      throw new Error("ECONNREFUSED http://rpc.secret/?key=abc");
    };
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(503);
    expect(res.json().ok).toBe(false);
    expect(JSON.stringify(res.json())).not.toMatch(/secret|abc|ECONNREFUSED/);
  });
});
