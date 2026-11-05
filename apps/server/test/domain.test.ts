import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { fetchDomainFile } from "../src/domain/fetchDomainFile.js";
import { createDomainResolver } from "../src/domain/resolver.js";
import { isBlockedAddress, normalizeDomain } from "../src/domain/ssrfGuard.js";

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local, metadata and reserved ranges", () => {
    for (const ip of [
      "0.0.0.0", "10.0.0.1", "10.255.255.255", "100.64.0.1", "127.0.0.1", "127.1.2.3", "169.254.169.254",
      "172.16.0.1", "172.31.255.255", "192.168.1.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "240.0.0.1", "255.255.255.255",
      "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1",
      "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "172.15.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("treats anything that is not an IP as blocked", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
  });
});

describe("normalizeDomain", () => {
  it("accepts plain hostnames and lowercases them", () => {
    expect(normalizeDomain("Northlight-Design.EXAMPLE")).toBe("northlight-design.example");
    expect(normalizeDomain(" shop.acme.com ")).toBe("shop.acme.com");
  });

  it("rejects IPs, ports, schemes, paths, user info, single labels and local names", () => {
    for (const bad of [
      "127.0.0.1", "10.0.0.1", "[::1]", "::1", "localhost", "foo.localhost", "printer.local", "db.internal", "intranet",
      "evil.com:8080", "http://evil.com", "https://evil.com/", "evil.com/path", "user@evil.com", "evil.com.", "-bad.com", "a..b.com", "evil com.io", "", "x".repeat(300) + ".com",
    ]) {
      expect(normalizeDomain(bad), bad).toBeUndefined();
    }
  });
});

describe("fetchDomainFile", () => {
  const servers: http.Server[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });

  async function serve(handler: http.RequestListener) {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return (server.address() as AddressInfo).port;
  }
  const local = (port: number, extra: object = {}) => ({ allowHttp: true, allowPrivate: true, port, resolve: async () => ["127.0.0.1"], ...extra });

  it("returns the parsed JSON, asking for the well-known path with the domain as Host and no credentials", async () => {
    let seen: http.IncomingMessage | undefined;
    const port = await serve((req, res) => {
      seen = req;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ version: 1, name: "x" }));
    });
    const r = await fetchDomainFile("shop.acme.com", local(port));
    expect(r).toEqual({ ok: true, value: { version: 1, name: "x" } });
    expect(seen?.url).toBe("/.well-known/truce.json");
    expect(seen?.headers.host).toBe("shop.acme.com");
    expect(seen?.headers.cookie).toBeUndefined();
    expect(seen?.headers.authorization).toBeUndefined();
  });

  it("does not follow redirects, and never contacts the redirect target", async () => {
    let targetHit = false;
    const targetPort = await serve((_req, res) => {
      targetHit = true;
      res.end("{}");
    });
    const port = await serve((_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", `http://127.0.0.1:${targetPort}/secret`);
      res.end();
    });
    const r = await fetchDomainFile("shop.acme.com", local(port));
    expect(r).toEqual({ ok: false, reason: "redirects are not followed" });
    expect(targetHit).toBe(false);
  });

  it("rejects non-200, non-JSON and oversized responses", async () => {
    const p404 = await serve((_req, res) => {
      res.statusCode = 404;
      res.end("no");
    });
    expect((await fetchDomainFile("shop.acme.com", local(p404))).ok).toBe(false);

    const pText = await serve((_req, res) => res.end("<html>not json</html>"));
    expect(await fetchDomainFile("shop.acme.com", local(pText))).toEqual({ ok: false, reason: "the file is not valid JSON" });

    const pBigDeclared = await serve((_req, res) => {
      res.setHeader("content-length", String(100_000));
      res.end("x".repeat(100_000));
    });
    expect(await fetchDomainFile("shop.acme.com", local(pBigDeclared))).toEqual({ ok: false, reason: "the file is too large" });

    const pBigChunked = await serve((_req, res) => {
      res.write("x".repeat(40_000));
      res.write("x".repeat(40_000));
      res.end();
    });
    expect(await fetchDomainFile("shop.acme.com", local(pBigChunked))).toEqual({ ok: false, reason: "the file is too large" });
  });

  it("gives up on a server that never answers and on one that dribbles bytes forever", async () => {
    const pSilent = await serve(() => {
      /* never respond */
    });
    const t0 = Date.now();
    expect(await fetchDomainFile("shop.acme.com", local(pSilent, { timeoutMs: 200 }))).toEqual({ ok: false, reason: "the request timed out" });
    expect(Date.now() - t0).toBeLessThan(2000);

    const pDribble = await serve((_req, res) => {
      res.write("{");
      const t = setInterval(() => res.write(" "), 30);
      res.on("close", () => clearInterval(t));
    });
    expect(await fetchDomainFile("shop.acme.com", local(pDribble, { timeoutMs: 300 }))).toEqual({ ok: false, reason: "the request timed out" });
  });

  it("refuses a domain that resolves to a private address, without connecting (DNS rebinding / internal hosts)", async () => {
    let hit = false;
    const port = await serve((_req, res) => {
      hit = true;
      res.end("{}");
    });
    for (const ip of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "::1", "::ffff:192.168.0.1"]) {
      const r = await fetchDomainFile("shop.acme.com", { allowHttp: true, port, resolve: async () => [ip] });
      expect(r, ip).toEqual({ ok: false, reason: "the domain points at a private or reserved address" });
    }
    expect(hit).toBe(false);
  });

  it("refuses when ANY resolved address is private, and resolves the name only once", async () => {
    let lookups = 0;
    const r = await fetchDomainFile("shop.acme.com", {
      resolve: async () => {
        lookups++;
        return ["8.8.8.8", "10.0.0.5"];
      },
    });
    expect(r.ok).toBe(false);
    expect(lookups).toBe(1);
  });

  it("is https only by default (a plain-http server cannot be reached)", async () => {
    const port = await serve((_req, res) => res.end("{}"));
    const r = await fetchDomainFile("shop.acme.com", { allowPrivate: true, port, resolve: async () => ["127.0.0.1"], timeoutMs: 1000 });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid names before any lookup", async () => {
    let lookups = 0;
    const resolve = async () => {
      lookups++;
      return ["8.8.8.8"];
    };
    for (const bad of ["127.0.0.1", "localhost", "evil.com:81", "http://evil.com"]) {
      expect(await fetchDomainFile(bad, { resolve })).toEqual({ ok: false, reason: "not a valid public domain name" });
    }
    expect(lookups).toBe(0);
  });

  it("reports an unresolvable domain", async () => {
    expect(await fetchDomainFile("nope.acme.com", { resolve: async () => [] })).toEqual({ ok: false, reason: "the domain does not resolve" });
    expect(
      await fetchDomainFile("nope.acme.com", {
        resolve: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).toEqual({ ok: false, reason: "the domain does not resolve" });
  });
});

describe("createDomainResolver", () => {
  it("serves *.example only from fixtures and only in demo mode", async () => {
    const on = createDomainResolver({ demoDomains: true });
    const file = (await on("Northlight-Design.example")) as { name: string; signingAddress: string };
    expect(file.name).toBe("Northlight Design Studio");
    expect(file.signingAddress).toBe("0x19d47570BA52E058bD6432009b2705F799b851Dc");
    expect(await on("unknown-merchant.example")).toBeNull();
    expect(await createDomainResolver({ demoDomains: false })("northlight-design.example")).toBeNull();
  });

  it("never fetches .example over the network, and rejects invalid names", async () => {
    let fetched = 0;
    const r = createDomainResolver({
      demoDomains: false,
      fetcher: async () => {
        fetched++;
        return { ok: true, value: {} };
      },
    });
    expect(await r("northlight-design.example")).toBeNull();
    expect(await r("127.0.0.1")).toBeNull();
    expect(await r("evil.com:80")).toBeNull();
    expect(fetched).toBe(0);
  });

  it("caches results for 5 minutes and failures for 30 seconds", async () => {
    let t = 0;
    let calls = 0;
    let answer: { ok: true; value: unknown } | { ok: false; reason: string } = { ok: true, value: { v: 1 } };
    const r = createDomainResolver({
      now: () => t,
      fetcher: async () => {
        calls++;
        return answer;
      },
    });
    expect(await r("shop.acme.com")).toEqual({ v: 1 });
    expect(await r("SHOP.acme.com")).toEqual({ v: 1 });
    expect(calls).toBe(1);
    t += 5 * 60 * 1000 + 1;
    answer = { ok: false, reason: "down" };
    expect(await r("shop.acme.com")).toBeNull();
    expect(calls).toBe(2);
    t += 10_000;
    expect(await r("shop.acme.com")).toBeNull(); // still cached
    expect(calls).toBe(2);
    t += 21_000;
    answer = { ok: true, value: { v: 2 } };
    expect(await r("shop.acme.com")).toEqual({ v: 2 });
    expect(calls).toBe(3);
  });
});
