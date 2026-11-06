import { describe, expect, it } from "vitest";
import { EMPTY_FORM, EXAMPLE_FORM, EXAMPLE_SETTINGS, checkForm, domainFileText, dueDateToUnix, formTotal, loadSettings, saveSettings } from "../src/merchantLogic";

const wallet = "0x19d47570BA52E058bD6432009b2705F799b851Dc";

describe("formTotal", () => {
  it("sums quantity times price and waits for complete lines", () => {
    expect(formTotal(EXAMPLE_FORM.lines)).toBe(1_250_000_000n);
    expect(formTotal([{ description: "a", quantity: "3", unitPrice: "0.5" }, { description: "b", quantity: "1", unitPrice: "2" }])).toBe(3_500_000n);
    expect(formTotal(EMPTY_FORM.lines)).toBeUndefined();
    expect(formTotal([{ description: "a", quantity: "x", unitPrice: "1" }])).toBeUndefined();
  });
});

describe("dueDateToUnix", () => {
  it("reads a UTC date, treats empty as on receipt and rejects junk", () => {
    expect(dueDateToUnix("2026-01-01")).toBe(1_767_225_600);
    expect(dueDateToUnix("")).toBe(0);
    expect(() => dueDateToUnix("01/01/2026")).toThrow(/year-month-day/);
    expect(() => dueDateToUnix("2026-13-45")).toThrow(/real date/);
  });
});

describe("checkForm", () => {
  it("turns the example form into an invoice labelled as example data", () => {
    const { invoice, details } = checkForm(EXAMPLE_FORM, EXAMPLE_SETTINGS, wallet, true, 1_767_000_000);
    expect(invoice.amount).toBe(1_250_000_000n);
    expect(invoice.payout).toBe(wallet);
    expect(details.example).toBe(true);
  });
  it("uses a separate payout wallet when given and locks the payer when given", () => {
    const payout = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const payer = "0xB17a0EE1E924daf6D968d344f129DF517F18a28E";
    const { invoice } = checkForm({ ...EXAMPLE_FORM, payer }, { ...EXAMPLE_SETTINGS, payout }, wallet, false);
    expect(invoice.payout).toBe(payout);
    expect(invoice.payer).toBe(payer);
  });
  it("explains what is missing", () => {
    expect(() => checkForm(EMPTY_FORM, EXAMPLE_SETTINGS, wallet, false)).toThrow(/client/);
    expect(() => checkForm({ ...EXAMPLE_FORM, validDays: "abc" }, EXAMPLE_SETTINGS, wallet, false)).toThrow(/days/);
  });
});

describe("domainFileText", () => {
  it("lists the signing wallet as the payout wallet by default", () => {
    const file = JSON.parse(domainFileText(EXAMPLE_SETTINGS, wallet));
    expect(file).toEqual({ version: 1, name: "Northlight Design Studio", signingAddress: wallet, payoutAddresses: [wallet], chainIds: [1874] });
  });
  it("lists a separate payout wallet when set", () => {
    const payout = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    expect(JSON.parse(domainFileText({ ...EXAMPLE_SETTINGS, payout }, wallet)).payoutAddresses).toEqual([payout]);
  });
});

describe("settings storage", () => {
  it("round trips and survives bad data", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveSettings(storage, { domain: "a.example", businessName: "A", payout: "" });
    expect(loadSettings(storage, EXAMPLE_SETTINGS).domain).toBe("a.example");
    mem.set("truce.merchant.settings", "{not json");
    expect(loadSettings(storage, EXAMPLE_SETTINGS)).toEqual(EXAMPLE_SETTINGS);
    expect(loadSettings(undefined, EXAMPLE_SETTINGS)).toEqual(EXAMPLE_SETTINGS);
  });
});
