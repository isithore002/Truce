import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure, api } from "../src/api";
import { extractHash, formatDate, formatUsdt, payLink, shortAddress, shortHash } from "../src/format";
import { match } from "../src/router";
import { walletMessage } from "../src/wallet";

describe("formatUsdt", () => {
  it("formats 6-decimal token units", () => {
    expect(formatUsdt("1250000000")).toBe("1,250.00 USDT");
    expect(formatUsdt("10000")).toBe("0.01 USDT");
    expect(formatUsdt("1")).toBe("0.000001 USDT");
    expect(formatUsdt("0")).toBe("0.00 USDT");
    expect(formatUsdt(1_234_567_890n)).toBe("1,234.56789 USDT");
  });
});

describe("dates and addresses", () => {
  it("formats dates in UTC", () => {
    expect(formatDate("1767225600")).toBe("1 Jan 2026");
    expect(formatDate(0)).toBe("1 Jan 1970");
  });
  it("shortens addresses and hashes", () => {
    expect(shortAddress("0x19d47570BA52E058bD6432009b2705F799b851Dc")).toBe("0x19d4...51Dc");
    expect(shortHash("0x" + "ab".repeat(32))).toBe("0xabababab...ababab");
    expect(shortAddress("0x12")).toBe("0x12");
  });
});

describe("links and hashes", () => {
  const h = "0x" + "AB".repeat(32);
  it("builds a pay link", () => {
    expect(payLink("http://localhost:5173/", h)).toBe(`http://localhost:5173/pay/${h}`);
  });
  it("extracts a hash from a link, a bare hash, or surrounding text", () => {
    const lower = h.toLowerCase();
    expect(extractHash(`http://localhost:5173/pay/${h}`)).toBe(lower);
    expect(extractHash(h)).toBe(lower);
    expect(extractHash(`please pay ${h} today`)).toBe(lower);
    expect(extractHash("0x1234")).toBeUndefined();
    expect(extractHash("")).toBeUndefined();
  });
});

describe("router match", () => {
  it("matches patterns and extracts params", () => {
    expect(match("/pay/:hash", "/pay/0xabc")).toEqual({ hash: "0xabc" });
    expect(match("/pay/:hash", "/pay/0xabc/")).toEqual({ hash: "0xabc" });
    expect(match("/pay/:hash", "/verify")).toBeUndefined();
    expect(match("/pay/:hash", "/pay")).toBeUndefined();
    expect(match("/pay/:hash", "/pay/a/b")).toBeUndefined();
  });
});

describe("API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })));

  it("returns the parsed body on success and accepts 202", async () => {
    respond(200, { chainId: 1874 });
    expect(await api.config()).toEqual({ chainId: 1874 });
    respond(202, { status: "PENDING" });
    expect(await api.authorize("0x1", {} as never)).toEqual({ status: "PENDING" });
  });

  it("turns the server's error body into an ApiFailure with its code and message", async () => {
    respond(422, { error: { code: "SIGNATURE_INVALID", message: "The signature does not match." } });
    const err = await api.invoice("0x1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect(err).toMatchObject({ code: "SIGNATURE_INVALID", message: "The signature does not match.", status: 422 });
  });

  it("reports an unreachable server in plain language", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const err = await api.config().catch((e) => e);
    expect(err).toMatchObject({ code: "NETWORK" });
    expect(err.message).toMatch(/Cannot reach the Truce server/);
  });

  it("survives a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error("not json"); } })));
    expect(await api.config().catch((e) => e)).toMatchObject({ code: "ERROR", status: 502 });
  });

  it("builds query strings", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", f);
    await api.verifyHash("0xabc", "0xdef");
    expect(f).toHaveBeenCalledWith("/api/verify?hash=0xabc&buyer=0xdef", expect.anything());
    expect(api.csvUrl("0xme")).toBe("/api/merchants/0xme/export.csv");
  });
});

describe("walletMessage", () => {
  it("explains a rejected signature, a pending request and passes other messages through", () => {
    expect(walletMessage({ code: 4001, message: "User rejected the request." })).toBe("You cancelled the request in your wallet.");
    expect(walletMessage({ message: "User denied transaction signature" })).toBe("You cancelled the request in your wallet.");
    expect(walletMessage({ code: -32002 })).toMatch(/already has a request open/);
    expect(walletMessage({ shortMessage: "Chain mismatch" })).toBe("Chain mismatch");
    expect(walletMessage(undefined)).toBe("The wallet reported an error.");
  });
});
