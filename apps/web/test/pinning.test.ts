import { describe, expect, it } from "vitest";
import { checkPin, loadPins, recordPin } from "../src/pinning";

const A = "0x19d47570BA52E058bD6432009b2705F799b851Dc";
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const C = "0x9fc3a0b7d1e5c4e2a8b6f0d3c7e1b5a9d2f4e6c8";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("key pinning", () => {
  it("is new before any payment, then same for the wallets that were paid", () => {
    const s = memory();
    expect(checkPin(loadPins(s), "shop.example", { merchant: A, payout: A })).toEqual({ status: "new" });
    recordPin(s, "Shop.Example", { merchant: A, payout: A }, 100);
    const r = checkPin(loadPins(s), "shop.example", { merchant: A.toLowerCase(), payout: A.toLowerCase() });
    expect(r.status).toBe("same");
  });

  it("warns when the payout wallet changes", () => {
    const s = memory();
    recordPin(s, "shop.example", { merchant: A, payout: A }, 100);
    const r = checkPin(loadPins(s), "shop.example", { merchant: A, payout: C });
    expect(r).toMatchObject({ status: "changed", signerChanged: false, payoutChanged: true });
  });

  it("warns when the signing wallet changes", () => {
    const s = memory();
    recordPin(s, "shop.example", { merchant: A, payout: A }, 100);
    expect(checkPin(loadPins(s), "shop.example", { merchant: B, payout: A })).toMatchObject({ status: "changed", signerChanged: true, payoutChanged: false });
  });

  it("warns on both, and pins are per domain", () => {
    const s = memory();
    recordPin(s, "shop.example", { merchant: A, payout: A }, 100);
    expect(checkPin(loadPins(s), "shop.example", { merchant: B, payout: C })).toMatchObject({ signerChanged: true, payoutChanged: true });
    expect(checkPin(loadPins(s), "other.example", { merchant: B, payout: C }).status).toBe("new");
  });

  it("adds a newly paid payout wallet to the pin, and replaces the pin when the signer changes", () => {
    const s = memory();
    recordPin(s, "shop.example", { merchant: A, payout: A }, 100);
    recordPin(s, "shop.example", { merchant: A, payout: B }, 200);
    expect(loadPins(s)["shop.example"].payoutAddresses).toEqual([A, B]);
    recordPin(s, "shop.example", { merchant: C, payout: C }, 300);
    expect(loadPins(s)["shop.example"]).toMatchObject({ signingAddress: C, payoutAddresses: [C], pinnedAt: 300 });
  });

  it("survives corrupt or missing storage", () => {
    const s = memory();
    s.m.set("truce.pins", "{oops");
    expect(loadPins(s)).toEqual({});
    s.m.set("truce.pins", JSON.stringify({ "a.example": { signingAddress: 5 }, "b.example": { signingAddress: A, payoutAddresses: [A] } }));
    expect(Object.keys(loadPins(s))).toEqual(["b.example"]);
    expect(loadPins(undefined)).toEqual({});
    expect(() => recordPin(undefined, "x.example", { merchant: A, payout: A }, 1)).not.toThrow();
  });
});
