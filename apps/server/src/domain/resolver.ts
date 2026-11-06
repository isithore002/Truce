import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDomainFile, parseDomainFile, type DomainResolver } from "@truce/invoice-lib";
import type { Address } from "viem";
import { fetchDomainFile, type FetchOptions, type FetchResult } from "./fetchDomainFile.js";
import { normalizeDomain } from "./ssrfGuard.js";

const fixturesDir = new URL("../../../../fixtures/domains/", import.meta.url);

/** Positive results live 5 minutes (docs/design/C-TECHNICAL.md section 5); failures 30 seconds. */
const POSITIVE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 1000;
const MAX_ENTRIES = 500;

export interface ResolverOptions {
  /** Serve fictional *.example merchants from fixtures/domains (labelled EXAMPLE DATA in the UI). */
  demoDomains?: boolean;
  /** Overrides the fixtures folder (tests). */
  fixtures?: URL | string;
  /** Folder for demo names registered through the setup page (demo mode only). Unset turns registration off. */
  registry?: URL | string;
  fetch?: FetchOptions;
  /** Replaces the network fetch (tests). */
  fetcher?: (domain: string) => Promise<FetchResult>;
  now?: () => number;
}

const dirPath = (base: URL | string) => decodeURIComponent(typeof base === "string" ? base : base.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

async function readJson(dir: string, domain: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(join(dir, `${domain}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** The built-in examples first (they cannot be overridden), then names registered through the setup page in demo mode. */
async function readFixture(opts: ResolverOptions, domain: string): Promise<unknown | null> {
  if (!opts.demoDomains) return null;
  const builtIn = await readJson(dirPath(opts.fixtures ?? fixturesDir), domain);
  if (builtIn !== null) return builtIn;
  return opts.registry ? readJson(dirPath(opts.registry), domain) : null;
}

export type RegisterResult = { ok: true; created: boolean } | { ok: false; reason: string };

/**
 * Demo mode only: lets the setup page publish a fictional `.example` merchant's file on this server, because such a name
 * has no website to publish on. The server builds the file itself from the wallets given, so nothing else can be written.
 * A built-in example cannot be replaced, and a name registered by one signing wallet cannot be taken over by another.
 * There is no proof of ownership: this is for fictional demo names, never for real domains.
 */
export async function registerDemoDomain(
  opts: ResolverOptions,
  input: { domain: string; name: string; signer: Address; payout: Address },
  dryRun = false,
): Promise<RegisterResult> {
  if (!opts.demoDomains || !opts.registry) return { ok: false, reason: "demo domains are not enabled on this server" };
  const domain = normalizeDomain(input.domain);
  if (!domain?.endsWith(".example")) return { ok: false, reason: "only fictional names ending in .example can be registered" };
  if ((await readJson(dirPath(opts.fixtures ?? fixturesDir), domain)) !== null) {
    return { ok: false, reason: `${domain} is one of the built-in examples and cannot be changed. Choose another name.` };
  }
  const existing = await readJson(dirPath(opts.registry), domain);
  const parsed = existing === null ? undefined : parseDomainFile(existing);
  if (parsed?.ok && parsed.value.signingAddress.toLowerCase() !== input.signer.toLowerCase()) {
    return { ok: false, reason: `${domain} was registered with a different signing wallet. Choose another name.` };
  }
  if (!dryRun) {
    const file = buildDomainFile({ name: input.name || domain, signingAddress: input.signer, payoutAddresses: [input.payout] });
    await mkdir(dirPath(opts.registry), { recursive: true });
    await writeFile(join(dirPath(opts.registry), `${domain}.json`), JSON.stringify({ _note: "EXAMPLE DATA. Registered through the demo setup page.", ...file }, null, 2) + "\n");
  }
  return { ok: true, created: existing === null };
}

/**
 * A fresh (never cached) read of a merchant's domain file that says why it failed. The setup page's "Check my
 * domain" button uses it, so a merchant who has just fixed the file is not shown a 30-second-old "not found".
 */
export function createDomainChecker(opts: ResolverOptions = {}): (input: string) => Promise<FetchResult> {
  const fetcher = opts.fetcher ?? ((d: string) => fetchDomainFile(d, opts.fetch));
  return async (input: string) => {
    const domain = normalizeDomain(input);
    if (!domain) return { ok: false, reason: "not a valid public domain name" };
    if (domain.endsWith(".example")) {
      if (!opts.demoDomains) return { ok: false, reason: "names ending in .example are fictional and only work when the server runs in demo mode" };
      const value = await readFixture(opts, domain);
      return value === null ? { ok: false, reason: "this demo server has no example file for that name" } : { ok: true, value };
    }
    return fetcher(domain);
  };
}

/**
 * The domain resolver the verify pipeline uses. `.example` is a reserved name that never resolves, so those
 * domains come only from local fixtures and only when demo mode is on; everything else is fetched over https
 * through the SSRF-guarded fetcher. Fetched results are cached per domain; local example files are read each time.
 */
export function createDomainResolver(opts: ResolverOptions = {}): DomainResolver {
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; ttl: number; value: unknown | null }>();
  const fetcher = opts.fetcher ?? ((d: string) => fetchDomainFile(d, opts.fetch));
  const fixture = (domain: string) => readFixture(opts, domain);

  return async (input: string) => {
    const domain = normalizeDomain(input);
    if (!domain) return null;

    // Local files are read every time (cheap), so a name registered a moment ago is seen at once.
    if (domain.endsWith(".example")) return fixture(domain);

    const hit = cache.get(domain);
    if (hit && now() - hit.at < hit.ttl) return hit.value;

    const r = await fetcher(domain);
    const value: unknown | null = r.ok ? r.value : null;
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(domain, { at: now(), ttl: value === null ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS, value });
    return value;
  };
}
