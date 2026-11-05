import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { TRACK_USDT } from "../src/authorization.js";
import { parseInvoiceDoc, toWire, type InvoiceDoc } from "../src/doc.js";
import { signInvoice } from "../src/sign.js";
import { CHECK_IDS, verifyInvoiceDoc, type CheckId, type VerifyContext } from "../src/verify.js";
import { ANVIL_KEY_0, baseInvoice, ctx, details } from "./fixtures.js";

const DOMAIN = "northlight-design.example";
const merchantAccount = privateKeyToAccount(ANVIL_KEY_0);
// Anvil account 2 (public test key): stands in for an attacker.
const attackerAccount = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const ATTACKER_PAYOUT = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as const;

const domainFile = {
  version: 1,
  name: "Northlight Design Studio",
  signingAddress: merchantAccount.address,
  payoutAddresses: [baseInvoice.payout],
  chainIds: [1874],
};

const vctx = (over: Partial<VerifyContext> = {}): VerifyContext => ({
  chainId: ctx.chainId,
  settler: ctx.verifyingContract,
  allowedTokens: [TRACK_USDT],
  now: baseInvoice.dueDate,
  resolveDomain: async () => domainFile,
  ...over,
});

async function honestDoc(): Promise<InvoiceDoc> {
  return { version: 1, invoice: baseInvoice, signature: await signInvoice(merchantAccount, baseInvoice, ctx), domain: DOMAIN, details };
}

const failedIds = (r: { checks: { id: CheckId; ok: boolean }[] }) => r.checks.filter((c) => !c.ok).map((c) => c.id);

describe("verifyInvoiceDoc: the five required scenarios", () => {
  it("PASS: an honest invoice passes all ten checks", async () => {
    const r = await verifyInvoiceDoc(toWire(await honestDoc()), vctx());
    expect(r.result).toBe("PASS");
    expect(r.checks.map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect(failedIds(r)).toEqual([]);
    expect(r.recoveredSigner).toBe(merchantAccount.address);
  });

  it("swapped payout (edited after signing): FAIL on the signature and the payout wallet", async () => {
    const doc = await honestDoc();
    doc.invoice = { ...doc.invoice, payout: ATTACKER_PAYOUT };
    const r = await verifyInvoiceDoc(toWire(doc), vctx());
    expect(r.result).toBe("FAIL");
    expect(failedIds(r)).toEqual(["signature_valid", "payout_in_domain_file"]);
  });

  it("swapped payout and re-signed by the attacker: FAIL on merchant and payout vs the domain file", async () => {
    const forged = { ...baseInvoice, merchant: attackerAccount.address, payout: ATTACKER_PAYOUT };
    const doc: InvoiceDoc = { version: 1, invoice: forged, signature: await signInvoice(attackerAccount, forged, ctx), domain: DOMAIN, details };
    const r = await verifyInvoiceDoc(toWire(doc), vctx());
    expect(r.result).toBe("FAIL");
    expect(failedIds(r)).toEqual(["merchant_matches_domain_file", "payout_in_domain_file"]);
    expect(r.checks.find((c) => c.id === "signature_valid")?.ok).toBe(true);
  });

  it("tampered amount: FAIL on the signature only", async () => {
    const doc = await honestDoc();
    doc.invoice = { ...doc.invoice, amount: doc.invoice.amount * 2n };
    const r = await verifyInvoiceDoc(toWire(doc), vctx());
    expect(r.result).toBe("FAIL");
    expect(failedIds(r)).toEqual(["signature_valid"]);
  });

  it("wrong signer (invoice names the merchant but another wallet signed): FAIL on the signature only", async () => {
    const doc = await honestDoc();
    doc.signature = await signInvoice(attackerAccount, baseInvoice, ctx);
    const r = await verifyInvoiceDoc(toWire(doc), vctx());
    expect(r.result).toBe("FAIL");
    expect(failedIds(r)).toEqual(["signature_valid"]);
  });

  it("expired: FAIL on not_expired only", async () => {
    const r = await verifyInvoiceDoc(toWire(await honestDoc()), vctx({ now: baseInvoice.expiry + 1n }));
    expect(r.result).toBe("FAIL");
    expect(failedIds(r)).toEqual(["not_expired"]);
  });
});

describe("verifyInvoiceDoc: other cases", () => {
  it("domain file unreachable (null): FAIL, and the dependent checks do not pass", async () => {
    const r = await verifyInvoiceDoc(toWire(await honestDoc()), vctx({ resolveDomain: async () => null }));
    expect(r.result).toBe("FAIL");
    expect(failedIds(r)).toEqual(["domain_file_reachable", "merchant_matches_domain_file", "payout_in_domain_file"]);
  });

  it("domain resolver throws: treated as unreachable, not as a crash", async () => {
    const r = await verifyInvoiceDoc(
      toWire(await honestDoc()),
      vctx({
        resolveDomain: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    );
    expect(r.result).toBe("FAIL");
    expect(failedIds(r)).toContain("domain_file_reachable");
  });

  it("malformed domain file: FAIL with a clear message", async () => {
    const r = await verifyInvoiceDoc(toWire(await honestDoc()), vctx({ resolveDomain: async () => ({ version: 1, name: "x" }) }));
    expect(r.result).toBe("FAIL");
    expect(r.checks.find((c) => c.id === "domain_file_reachable")?.message).toMatch(/not a valid Truce domain file/);
  });

  it("memo changed after signing: FAIL on memo_hash_matches_details only", async () => {
    const doc = await honestDoc();
    doc.details = { ...doc.details, notes: "Net 90" };
    const r = await verifyInvoiceDoc(toWire(doc), vctx());
    expect(failedIds(r)).toEqual(["memo_hash_matches_details"]);
  });

  it("invoice signed for another domain: FAIL on domain_hash_matches only", async () => {
    const doc = await honestDoc();
    doc.domain = "other.example";
    const r = await verifyInvoiceDoc(toWire(doc), vctx());
    expect(failedIds(r)).toEqual(["domain_hash_matches"]);
  });

  it("token not accepted by the settler: FAIL on chain_and_token_allowed", async () => {
    const r = await verifyInvoiceDoc(toWire(await honestDoc()), vctx({ allowedTokens: [] }));
    expect(failedIds(r)).toEqual(["chain_and_token_allowed"]);
  });

  it("domain file does not list this chain: FAIL on chain_and_token_allowed", async () => {
    const r = await verifyInvoiceDoc(toWire(await honestDoc()), vctx({ resolveDomain: async () => ({ ...domainFile, chainIds: [1875] }) }));
    expect(failedIds(r)).toEqual(["chain_and_token_allowed"]);
  });

  it("payer lock: other wallet fails, locked wallet and unknown wallet pass", async () => {
    const locked = { ...baseInvoice, payer: attackerAccount.address };
    const doc: InvoiceDoc = { version: 1, invoice: locked, signature: await signInvoice(merchantAccount, locked, ctx), domain: DOMAIN, details };
    const wire = toWire(doc);
    expect(failedIds(await verifyInvoiceDoc(wire, vctx({ buyer: ATTACKER_PAYOUT })))).toEqual(["payer_ok"]);
    expect((await verifyInvoiceDoc(wire, vctx({ buyer: attackerAccount.address }))).result).toBe("PASS");
    expect((await verifyInvoiceDoc(wire, vctx())).result).toBe("PASS");
  });

  it("a different settler address invalidates the signature", async () => {
    const wire = toWire(await honestDoc());
    expect(failedIds(await verifyInvoiceDoc(wire, vctx({ settler: "0x0000000000000000000000000000000000005678" })))).toEqual(["signature_valid"]);
  });
});

describe("untrusted input", () => {
  it("garbage reports document_valid failed and all ten ids, without throwing", async () => {
    for (const junk of [null, 42, "x", [], {}, { version: 1 }]) {
      const r = await verifyInvoiceDoc(junk, vctx());
      expect(r.result).toBe("FAIL");
      expect(r.checks.map((c) => c.id)).toEqual([...CHECK_IDS]);
      expect(r.checks[0].ok).toBe(false);
    }
  });

  it("rejects unknown fields in details (they would silently change the memo hash)", async () => {
    const wire = toWire(await honestDoc());
    const r = await verifyInvoiceDoc({ ...wire, details: { ...wire.details, extra: "x" } }, vctx());
    expect(r.result).toBe("FAIL");
    expect(r.checks[0].message).toMatch(/unexpected field "extra"/);
  });

  it("rejects numbers that are not decimal strings and bad addresses", async () => {
    const wire = toWire(await honestDoc());
    expect(parseInvoiceDoc({ ...wire, invoice: { ...wire.invoice, amount: 1250 } }).ok).toBe(false);
    expect(parseInvoiceDoc({ ...wire, invoice: { ...wire.invoice, payout: "0x123" } }).ok).toBe(false);
    expect(parseInvoiceDoc({ ...wire, invoice: { ...wire.invoice, dueDate: "18446744073709551616" } }).ok).toBe(false);
  });

  it("round trips through the wire form", async () => {
    const doc = await honestDoc();
    const parsed = parseInvoiceDoc(JSON.parse(JSON.stringify(toWire(doc))));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.invoice).toEqual(doc.invoice);
  });
});
