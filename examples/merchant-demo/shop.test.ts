import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShop, PRODUCTS, page, type MakeInvoice } from "./shopServer.js";

let server: Server;
let base: string;
const makeInvoice = vi.fn<MakeInvoice>();

beforeEach(async () => {
  makeInvoice.mockReset().mockResolvedValue({ link: "http://localhost:5173/pay/0xabc", hash: "0xabc" });
  server = createShop(makeInvoice);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const post = (body: unknown, raw?: string) =>
  fetch(`${base}/invoice`, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });

describe("the shop page", () => {
  it("is labelled EXAMPLE DATA and lists every service with its price", async () => {
    const html = await (await fetch(base)).text();
    expect(html).toContain("EXAMPLE DATA");
    for (const p of PRODUCTS) expect(html).toContain(`${p.name}`), expect(html).toContain(`${p.price} USDT`);
    expect(html).toBe(page());
  });
  it("does not over-claim", () => {
    expect(page()).not.toMatch(/guaranteed|trustless|verified business|only|first/i);
  });
});

describe("POST /invoice", () => {
  it("creates an invoice for a service and returns the pay link", async () => {
    const res = await post({ productId: "brand", clientName: "  Beta Labs  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ link: "http://localhost:5173/pay/0xabc", hash: "0xabc" });
    expect(makeInvoice).toHaveBeenCalledWith(PRODUCTS[0], "Beta Labs");
  });
  it("takes the price from the server's list, never from the browser", async () => {
    await post({ productId: "audit", clientName: "Beta Labs", price: "1000000", unitPrice: "1000000" });
    expect(makeInvoice.mock.calls[0][0].price).toBe("0.05");
  });
  it("rejects an unknown service, a missing or long name, and bad JSON", async () => {
    expect((await post({ productId: "nope", clientName: "x" })).status).toBe(400);
    expect((await post({ productId: "brand", clientName: "   " })).status).toBe(400);
    expect((await post({ productId: "brand", clientName: "x".repeat(61) })).status).toBe(400);
    expect((await post({ productId: "brand" })).status).toBe(400);
    expect((await post(null, "{not json")).status).toBe(400);
    expect(makeInvoice).not.toHaveBeenCalled();
  });
  it("rejects an oversized body", async () => {
    const res = await post({ productId: "brand", clientName: "x", pad: "y".repeat(10_000) }).catch(() => undefined);
    expect(res === undefined || res.status === 400).toBe(true);
    expect(makeInvoice).not.toHaveBeenCalled();
  });
  it("turns a failure into a 502 with a short message and no stack", async () => {
    makeInvoice.mockRejectedValue(new Error("server unreachable"));
    const res = await post({ productId: "brand", clientName: "Beta Labs" });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Could not create the invoice: server unreachable");
    expect(JSON.stringify(body)).not.toContain("at ");
  });
});

describe("other routes", () => {
  it("answers 404 for anything else", async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/invoice`)).status).toBe(404);
  });
});
