import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/api/app.js";
import { evaluateDomainFile } from "../src/api/domainCheck.js";
import { MockChain } from "../src/chain/mock.js";
import { createDomainChecker } from "../src/domain/resolver.js";
import { JsonStore } from "../src/shared/store.js";
import { setup, domainFile } from "./appSetup.js";
import { ATTACKER_PAYOUT, DOMAIN, PAYOUT, SETTLER, attacker, merchant } from "./helpers.js";

const ok = { ok: true as const, value: domainFile };
const input = { domain: "acme.com", signer: merchant.address, payout: PAYOUT, chainId: 1874 };

describe("evaluateDomainFile", () => {
  it("is OK when the file lists the signing wallet and the payout wallet", () => {
    const r = evaluateDomainFile(ok, input);
    expect(r.status).toBe("OK");
    expect(r.demo).toBe(false);
    expect(r.message).toContain("https://acme.com/.well-known/truce.json");
    expect(r.message).toContain("buyers will see PASS");
  });

  it("says why a file could not be read", () => {
    const r = evaluateDomainFile({ ok: false, reason: "redirects are not followed" }, input);
    expect(r.status).toBe("UNREACHABLE");
    expect(r.message).toContain("redirects are not followed");
    expect(r.message).toContain("Buyers would see FAIL");
  });

  it("rejects a file that is not a Truce domain file", () => {
    expect(evaluateDomainFile({ ok: true, value: { hello: "world" } }, input).status).toBe("INVALID_FILE");
  });

  it("flags a different signing wallet and returns what the file lists", () => {
    const r = evaluateDomainFile(ok, { ...input, signer: attacker.address });
    expect(r.status).toBe("SIGNER_MISMATCH");
    expect(r.listed?.signingAddress).toBe(merchant.address);
  });

  it("flags a payout wallet that is not listed", () => {
    expect(evaluateDomainFile(ok, { ...input, payout: ATTACKER_PAYOUT }).status).toBe("PAYOUT_NOT_LISTED");
  });

  it("flags a file that does not list the network", () => {
    expect(evaluateDomainFile({ ok: true, value: { ...domainFile, chainIds: [1] } }, input).status).toBe("CHAIN_NOT_LISTED");
  });

  it("compares addresses without caring about letter case", () => {
    const lower = { ok: true as const, value: { ...domainFile, signingAddress: merchant.address.toLowerCase(), payoutAddresses: [PAYOUT.toLowerCase()] } };
    expect(evaluateDomainFile(lower, input).status).toBe("OK");
  });

  it("labels a .example domain as a demo, not a website", () => {
    const r = evaluateDomainFile(ok, { ...input, domain: DOMAIN });
    expect(r.status).toBe("OK");
    expect(r.demo).toBe(true);
    expect(r.message).toContain("fictional demo domain");
  });
});

describe("GET /api/domain-check", () => {
  const q = (o: Record<string, string>) => new URLSearchParams({ domain: DOMAIN, signer: merchant.address, payout: PAYOUT, ...o }).toString();

  it("answers OK for the listed wallets", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: `/api/domain-check?${q({})}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "OK", domain: DOMAIN, demo: true });
  });

  it("answers SIGNER_MISMATCH for another wallet, and says which wallet is listed", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: `/api/domain-check?${q({ signer: attacker.address })}` });
    expect(res.json()).toMatchObject({ status: "SIGNER_MISMATCH", listed: { signingAddress: merchant.address } });
  });

  it("answers UNREACHABLE for a domain with no file", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: `/api/domain-check?${q({ domain: "nothing-here.com" })}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("UNREACHABLE");
  });

  it("normalises the domain (case and spaces)", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: `/api/domain-check?${q({ domain: `  ${DOMAIN.toUpperCase()} ` })}` });
    expect(res.json()).toMatchObject({ status: "OK", domain: DOMAIN });
  });

  it("refuses a domain that is not a public name, so it cannot be used to probe the server's network", async () => {
    const { app } = setup();
    for (const domain of ["localhost", "10.0.0.1", "printer.local", "not a domain", "169.254.169.254"]) {
      const res = await app.inject({ method: "GET", url: `/api/domain-check?${q({ domain })}` });
      expect(res.statusCode, domain).toBe(400);
      expect(res.json().error.code).toBe("INVALID_DOCUMENT");
    }
  });

  it("refuses a missing or malformed wallet", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: `/api/domain-check?domain=${DOMAIN}&signer=0x123&payout=${PAYOUT}` })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/domain-check?domain=${DOMAIN}` })).statusCode).toBe(400);
  });

  it("is rate limited per caller", async () => {
    const { app } = setup();
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await app.inject({ method: "GET", url: `/api/domain-check?${q({})}` })).statusCode;
    expect(last).toBe(429);
  });

  it("reads fresh every time: a fixed file is seen at once, with no 30-second stale 'not found'", async () => {
    let published = false;
    const chain = new MockChain({ settler: SETTLER });
    const app = buildApp({
      chain,
      store: new JsonStore(),
      resolveDomain: async () => null,
      checkDomain: async () => (published ? { ok: true, value: domainFile } : { ok: false, reason: "the server answered HTTP 404" }),
    });
    const url = `/api/domain-check?${q({ domain: "acme.com" })}`;
    expect((await app.inject({ method: "GET", url })).json().status).toBe("UNREACHABLE");
    published = true;
    expect((await app.inject({ method: "GET", url })).json().status).toBe("OK");
  });
});

describe("createDomainChecker", () => {
  const dir = mkdtempSync(join(tmpdir(), "truce-fixtures-"));
  writeFileSync(join(dir, "shop.example.json"), JSON.stringify(domainFile));

  it("reads a .example file from the fixtures in demo mode", async () => {
    expect(await createDomainChecker({ demoDomains: true, fixtures: dir })("shop.example")).toEqual({ ok: true, value: domainFile });
  });

  it("says plainly that .example names need demo mode, and that a missing example file is missing", async () => {
    const off = await createDomainChecker({ demoDomains: false, fixtures: dir })("shop.example");
    expect(off).toMatchObject({ ok: false });
    expect((off as { reason: string }).reason).toContain("demo mode");
    const missing = await createDomainChecker({ demoDomains: true, fixtures: dir })("other.example");
    expect((missing as { reason: string }).reason).toContain("no example file");
  });

  it("is not cached", async () => {
    let calls = 0;
    const fetcher = async () => (++calls === 1 ? { ok: false as const, reason: "the server answered HTTP 404" } : { ok: true as const, value: domainFile });
    const check = createDomainChecker({ fetcher });
    expect((await check("acme.com")).ok).toBe(false);
    expect((await check("acme.com")).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("rejects names that are not public hostnames before any fetch", async () => {
    let calls = 0;
    const check = createDomainChecker({ fetcher: async () => (calls++, { ok: false as const, reason: "x" }) });
    expect(await check("localhost")).toMatchObject({ ok: false });
    expect(calls).toBe(0);
  });
});
