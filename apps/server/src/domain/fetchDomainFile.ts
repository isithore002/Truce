import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isBlockedAddress, normalizeDomain } from "./ssrfGuard.js";

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Test/dev only: allow plain http. Production fetches https only. */
  allowHttp?: boolean;
  /** Test only: skip the private-address block so a local test server can be reached. */
  allowPrivate?: boolean;
  /** Test only: connect to this port instead of 443 (or 80 with allowHttp). */
  port?: number;
  /** Resolves a hostname to every address it points to. Injectable for tests. */
  resolve?: (host: string) => Promise<string[]>;
}

export type FetchResult = { ok: true; value: unknown } | { ok: false; reason: string };

const defaultResolve = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
const fail = (reason: string): FetchResult => ({ ok: false, reason });

/**
 * Fetches https://<domain>/.well-known/truce.json for verification, as safely as a server-side fetch can be:
 * https only; the hostname is resolved once, every address must be public, and the connection is pinned to
 * that address (no second DNS lookup, so DNS rebinding cannot swap in a private IP); TLS is checked against
 * the domain name; no redirects; 3 s overall deadline; 64 KB cap; no cookies or credentials sent.
 */
export async function fetchDomainFile(domain: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const host = normalizeDomain(domain);
  if (!host) return fail("not a valid public domain name");

  const timeoutMs = opts.timeoutMs ?? 3000;
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  const useHttp = opts.allowHttp === true;

  let addresses: string[];
  try {
    addresses = await (opts.resolve ?? defaultResolve)(host);
  } catch {
    return fail("the domain does not resolve");
  }
  if (addresses.length === 0) return fail("the domain does not resolve");
  if (!opts.allowPrivate && addresses.some(isBlockedAddress)) return fail("the domain points at a private or reserved address");
  const address = addresses[0];

  return new Promise<FetchResult>((resolve) => {
    let settled = false;
    const done = (r: FetchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(r);
    };

    const lib = useHttp ? http : https;
    const req = lib.request(
      {
        host: address,
        port: opts.port ?? (useHttp ? 80 : 443),
        path: "/.well-known/truce.json",
        method: "GET",
        agent: false, // no connection reuse, so nothing is shared between fetches
        headers: { host, accept: "application/json", "user-agent": "truce-verifier/1" },
        ...(useHttp ? {} : { servername: host }), // TLS identity is checked against the domain, not the IP
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.destroy();
          return done(fail("redirects are not followed"));
        }
        if (status !== 200) {
          res.destroy();
          return done(fail(`the server answered HTTP ${status}`));
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          return done(fail("the file is too large"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            return done(fail("the file is too large"));
          }
          chunks.push(c);
        });
        res.on("end", () => {
          try {
            done({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          } catch {
            done(fail("the file is not valid JSON"));
          }
        });
        res.on("error", () => done(fail("the connection failed")));
      },
    );
    // One deadline for the whole exchange, so a server that dribbles bytes cannot hold the request open.
    const deadline = setTimeout(() => {
      req.destroy();
      done(fail("the request timed out"));
    }, timeoutMs);
    req.on("error", () => done(fail("could not connect")));
    req.end();
  });
}
