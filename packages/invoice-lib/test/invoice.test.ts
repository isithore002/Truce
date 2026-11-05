import { concat, encodeAbiParameters, keccak256, pad, parseAbiParameters, stringToHex, toHex, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { domainHash, invoiceHash } from "../src/hash.js";
import { canonicalJson, memoHash } from "../src/memo.js";
import type { Invoice, InvoiceDetails, SigningContext } from "../src/types.js";

export const ctx: SigningContext = {
  chainId: 1874,
  verifyingContract: "0x0000000000000000000000000000000000001234",
};

export const details: InvoiceDetails = {
  merchantName: "Northlight Design Studio",
  clientName: "Beta Labs",
  lineItems: [{ description: "Brand identity", quantity: "1", unitPrice: "1250000000" }],
  notes: "Net 30",
  example: true,
};

export const baseInvoice: Invoice = {
  invoiceId: pad("0x0102030405060708090a0b0c0d0e0f10", { size: 32 }),
  merchant: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  payout: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  token: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
  amount: 1_250_000_000n,
  dueDate: 1_767_225_600n,
  expiry: 1_767_484_800n,
  payer: "0x0000000000000000000000000000000000000000",
  domainHash: domainHash("northlight-design.example"),
  memoHash: memoHash(details),
};

describe("canonicalJson and memoHash", () => {
  it("sorts keys at every level with no whitespace", () => {
    expect(canonicalJson({ b: "1", a: { d: true, c: ["x", { z: "1", y: "2" }] } })).toBe(
      '{"a":{"c":["x",{"y":"2","z":"1"}],"d":true},"b":"1"}',
    );
  });

  it("is stable under key reordering", () => {
    const reordered: InvoiceDetails = {
      example: true,
      notes: "Net 30",
      lineItems: [{ unitPrice: "1250000000", quantity: "1", description: "Brand identity" }],
      clientName: "Beta Labs",
      merchantName: "Northlight Design Studio",
    };
    expect(memoHash(reordered)).toBe(memoHash(details));
  });

  it("changes when any detail changes", () => {
    expect(memoHash({ ...details, notes: "Net 31" })).not.toBe(memoHash(details));
    expect(memoHash({ ...details, example: false })).not.toBe(memoHash(details));
  });

  it("rejects raw numbers (numbers must be strings)", () => {
    expect(() => canonicalJson({ a: 1 } as never)).toThrow(TypeError);
  });

  it("hashes UTF-8 bytes of the canonical JSON", () => {
    const d = { ...details, notes: "Zahlbar in 30 Tagen – café ☕" };
    expect(memoHash(d)).toBe(keccak256(stringToHex(canonicalJson(d))));
  });
});

describe("domainHash", () => {
  it("lowercases before hashing", () => {
    expect(domainHash("Northlight-Design.EXAMPLE")).toBe(keccak256(stringToHex("northlight-design.example")));
  });
});

// Independent EIP-712 encoding (no viem typed-data helpers) to catch type-string or field-order drift.
function manualDigest(inv: Invoice, c: SigningContext): Hex {
  const typeHash = keccak256(
    stringToHex(
      "Invoice(bytes32 invoiceId,address merchant,address payout,address token,uint256 amount,uint64 dueDate,uint64 expiry,address payer,bytes32 domainHash,bytes32 memoHash)",
    ),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32, bytes32, address, address, address, uint256, uint64, uint64, address, bytes32, bytes32"),
      [typeHash, inv.invoiceId, inv.merchant, inv.payout, inv.token, inv.amount, inv.dueDate, inv.expiry, inv.payer, inv.domainHash, inv.memoHash],
    ),
  );
  const domainTypeHash = keccak256(stringToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  const domainSeparator = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32, uint256, address"), [
      domainTypeHash,
      keccak256(stringToHex("Truce")),
      keccak256(stringToHex("1")),
      BigInt(c.chainId),
      c.verifyingContract,
    ]),
  );
  return keccak256(concat(["0x1901", domainSeparator, structHash]));
}

describe("invoiceHash", () => {
  it("matches a hand-rolled EIP-712 encoding", () => {
    expect(invoiceHash(baseInvoice, ctx)).toBe(manualDigest(baseInvoice, ctx));
  });

  const tweaks: Record<keyof Invoice, Invoice[keyof Invoice]> = {
    invoiceId: pad(toHex(99n), { size: 32 }),
    merchant: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    payout: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    token: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    amount: 1_250_000_001n,
    dueDate: 1_767_225_601n,
    expiry: 1_767_484_801n,
    payer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    domainHash: domainHash("other.example"),
    memoHash: memoHash({ ...details, notes: "changed" }),
  };

  for (const field of Object.keys(tweaks) as (keyof Invoice)[]) {
    it(`changing ${field} changes the hash`, () => {
      expect(invoiceHash({ ...baseInvoice, [field]: tweaks[field] }, ctx)).not.toBe(invoiceHash(baseInvoice, ctx));
    });
  }

  it("binds chain id and verifying contract", () => {
    const h = invoiceHash(baseInvoice, ctx);
    expect(invoiceHash(baseInvoice, { ...ctx, chainId: 1875 })).not.toBe(h);
    expect(invoiceHash(baseInvoice, { ...ctx, verifyingContract: "0x0000000000000000000000000000000000005678" })).not.toBe(h);
  });
});
