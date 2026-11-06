import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildDomainFile, buildInvoice, parseUsdt } from "../src/builder.js";
import { invoiceHash } from "../src/hash.js";
import { memoHash } from "../src/memo.js";
import { recoverMerchant, signInvoice } from "../src/sign.js";
import { parseDomainFile } from "../src/doc.js";
import { ctx } from "./fixtures.js";

const merchant = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const base = {
  merchant: merchant as `0x${string}`,
  domain: "Northlight-Design.example",
  merchantName: "Northlight Design Studio",
  clientName: "Beta Labs",
  lineItems: [{ description: "Brand identity", quantity: "2", unitPrice: "625" }],
  now: 1_767_000_000,
};

describe("parseUsdt", () => {
  it("parses decimals into 6-decimal units", () => {
    expect(parseUsdt("1250")).toBe(1_250_000_000n);
    expect(parseUsdt("0.01")).toBe(10_000n);
    expect(parseUsdt(" 12.5 ")).toBe(12_500_000n);
    expect(parseUsdt("0.000001")).toBe(1n);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "-1", "1e3", "1,000", "0.0000001", "abc", "1."]) expect(() => parseUsdt(bad)).toThrow();
  });
});

describe("buildInvoice", () => {
  it("computes the total from the lines and defaults payout to the merchant", () => {
    const { invoice, details } = buildInvoice(base);
    expect(invoice.amount).toBe(1_250_000_000n);
    expect(invoice.payout).toBe(invoice.merchant);
    expect(invoice.payer).toBe("0x0000000000000000000000000000000000000000");
    expect(invoice.memoHash).toBe(memoHash(details));
    expect(details.lineItems[0]).toEqual({ description: "Brand identity", quantity: "2", unitPrice: "625000000" });
    expect(invoice.dueDate).toBe(0n);
    expect(invoice.expiry).toBe(BigInt(1_767_000_000 + 30 * 86_400));
  });
  it("keeps the invoice open for N days after the due date", () => {
    const { invoice } = buildInvoice({ ...base, dueDate: 1_769_000_000, validDays: 10 });
    expect(invoice.dueDate).toBe(1_769_000_000n);
    expect(invoice.expiry).toBe(BigInt(1_769_000_000 + 10 * 86_400));
  });
  it("produces an invoice the merchant can sign and anyone can recover", async () => {
    const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const { invoice } = buildInvoice({ ...base, merchant: acct.address });
    const sig = await signInvoice(acct, invoice, ctx);
    expect(await recoverMerchant(invoice, sig, ctx)).toBe(acct.address);
    expect(invoiceHash(invoice, ctx)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("gives each invoice a fresh id", () => {
    expect(buildInvoice(base).invoice.invoiceId).not.toBe(buildInvoice(base).invoice.invoiceId);
  });
  it("rejects bad input with a plain message", () => {
    expect(() => buildInvoice({ ...base, domain: "localhost" })).toThrow(/domain/);
    expect(() => buildInvoice({ ...base, clientName: " " })).toThrow(/client/);
    expect(() => buildInvoice({ ...base, lineItems: [] })).toThrow(/line item/);
    expect(() => buildInvoice({ ...base, lineItems: [{ description: "x", quantity: "0", unitPrice: "1" }] })).toThrow(/quantity/);
    expect(() => buildInvoice({ ...base, lineItems: [{ description: "x", quantity: "1", unitPrice: "0" }] })).toThrow(/above zero/);
    expect(() => buildInvoice({ ...base, validDays: 0 })).toThrow(/days/);
  });
});

describe("buildDomainFile", () => {
  it("builds a file the parser accepts, with the signer as default payout", () => {
    const f = buildDomainFile({ name: "Northlight Design Studio", signingAddress: merchant });
    expect(f.payoutAddresses).toEqual([merchant]);
    expect(parseDomainFile(JSON.parse(JSON.stringify(f))).ok).toBe(true);
  });
  it("de-duplicates payouts", () => {
    const f = buildDomainFile({ name: "x", signingAddress: merchant, payoutAddresses: [merchant, merchant.toLowerCase() as `0x${string}`] });
    expect(f.payoutAddresses).toHaveLength(1);
  });
});
