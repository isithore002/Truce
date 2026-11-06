import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/api/app.js";
import { evaluateDomainFile } from "../src/api/domainCheck.js";
import { MockChain } from "../src/chain/mock.js";
import { createDomainChecker, createDomainResolver, registerDemoDomain } from "../src/domain/resolver.js";
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

describe("demo registry: publishing a fictional .example name for the connected wallet", () => {
  const FIX = mkdtempSync(join(tmpdir(), "truce-fx-"));
  writeFileSync(join(FIX, "built-in.example.json"), JSON.stringify(domainFile));
  const fresh = () => ({ demoDomains: true, fixtures: FIX, registry: join(mkdtempSync(join(tmpdir(), "truce-reg-")), "nested") });
  const me = { domain: "my-studio.example", name: "My Studio", signer: attacker.address, payout: ATTACKER_PAYOUT };

  it("writes a file the verify resolver and the checker both see at once, built by the server from the wallets given", async () => {
    const o = fresh();
    const resolve = createDomainResolver(o);
    expect(await resolve("my-studio.example")).toBeNull(); // a miss is not remembered
    expect(await registerDemoDomain(o, me)).toEqual({ ok: true, created: true });
    expect(await resolve("my-studio.example")).toMatchObject({ version: 1, name: "My Studio", signingAddress: attacker.address, payoutAddresses: [ATTACKER_PAYOUT], chainIds: [1874] });
    expect((await createDomainChecker(o)("my-studio.example")).ok).toBe(true);
  });

  it("lets the same signing wallet update its payout, and refuses another wallet taking the name", async () => {
    const o = fresh();
    await registerDemoDomain(o, me);
    expect(await registerDemoDomain(o, { ...me, payout: PAYOUT })).toEqual({ ok: true, created: false });
    expect(await createDomainResolver(o)("my-studio.example")).toMatchObject({ payoutAddresses: [PAYOUT] });
    const taken = await registerDemoDomain(o, { ...me, signer: merchant.address });
    expect(taken).toMatchObject({ ok: false });
    expect((taken as { reason: string }).reason).toContain("different signing wallet");
  });

  it("never replaces a built-in example, and only accepts .example names, and only in demo mode", async () => {
    const o = fresh();
    const builtIn = await registerDemoDomain(o, { ...me, domain: "built-in.example" });
    expect((builtIn as { reason: string }).reason).toContain("built-in");
    expect(await registerDemoDomain(o, { ...me, domain: "acme.com" })).toMatchObject({ ok: false });
    expect(await registerDemoDomain(o, { ...me, domain: "localhost" })).toMatchObject({ ok: false });
    expect(await registerDemoDomain({ ...o, demoDomains: false }, me)).toMatchObject({ ok: false });
    expect(await registerDemoDomain({ demoDomains: true, fixtures: FIX }, me)).toMatchObject({ ok: false }); // no registry folder set
  });

  it("a dry run changes nothing", async () => {
    const o = fresh();
    expect(await registerDemoDomain(o, me, true)).toEqual({ ok: true, created: true });
    expect(await createDomainResolver(o)("my-studio.example")).toBeNull();
  });

  describe("routes", () => {
    const appFor = (o: ReturnType<typeof fresh>, enabled = true) =>
      buildApp({
        chain: new MockChain({ settler: SETTLER }),
        store: new JsonStore(),
        resolveDomain: createDomainResolver(o),
        checkDomain: createDomainChecker(o),
        registerDemoDomain: enabled ? (i, dry) => registerDemoDomain(o, i, dry) : undefined,
        exampleMode: true,
      });
    const check = (d: string, signer = me.signer) => `/api/domain-check?${new URLSearchParams({ domain: d, signer, payout: me.payout })}`;

    it("offers registration for an unregistered demo name, then the check passes after it", async () => {
      const app = appFor(fresh());
      const before = (await app.inject({ method: "GET", url: check("my-studio.example") })).json();
      expect(before).toMatchObject({ status: "UNREACHABLE", demo: true, canRegister: true });
      expect(before.message).toContain("No example file is registered");

      const post = await app.inject({ method: "POST", url: "/api/demo-domains", payload: me });
      expect(post.statusCode).toBe(201);
      expect(post.json()).toEqual({ domain: "my-studio.example", created: true });

      const after = (await app.inject({ method: "GET", url: check("my-studio.example") })).json();
      expect(after.status).toBe("OK");
      expect(after.canRegister).toBeUndefined();
    });

    it("explains why a built-in example, or a name another wallet registered, cannot be taken", async () => {
      const o = fresh();
      const app = appFor(o);
      await registerDemoDomain(o, { ...me, signer: merchant.address });
      const other = (await app.inject({ method: "GET", url: check("my-studio.example") })).json();
      expect(other).toMatchObject({ status: "SIGNER_MISMATCH", canRegister: false });
      expect(other.registerBlocked).toContain("different signing wallet");
      const res = await app.inject({ method: "POST", url: "/api/demo-domains", payload: me });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain("Cannot register my-studio.example");
    });

    it("is absent outside demo mode, and never offered for a real domain", async () => {
      const off = appFor(fresh(), false);
      expect((await off.inject({ method: "POST", url: "/api/demo-domains", payload: me })).statusCode).toBe(404);
      const on = appFor(fresh());
      const real = (await on.inject({ method: "GET", url: check("acme.com") })).json();
      expect(real.demo).toBe(false);
      expect(real.canRegister).toBeUndefined();
      expect((await on.inject({ method: "POST", url: "/api/demo-domains", payload: { ...me, domain: "acme.com" } })).statusCode).toBe(400);
    });

    it("rejects a malformed wallet and is rate limited", async () => {
      const app = appFor(fresh());
      expect((await app.inject({ method: "POST", url: "/api/demo-domains", payload: { ...me, signer: "0x123" } })).statusCode).toBe(400);
      let last = 0;
      for (let i = 0; i < 12; i++) last = (await app.inject({ method: "POST", url: "/api/demo-domains", payload: me })).statusCode;
      expect(last).toBe(429);
    });
  });
});
