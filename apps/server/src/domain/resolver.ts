import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DomainResolver } from "@truce/invoice-lib";
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
  fetch?: FetchOptions;
  /** Replaces the network fetch (tests). */
  fetcher?: (domain: string) => Promise<FetchResult>;
  now?: () => number;
}

/**
 * The domain resolver the verify pipeline uses. `.example` is a reserved name that never resolves, so those
 * domains come only from local fixtures and only when demo mode is on; everything else is fetched over https
 * through the SSRF-guarded fetcher. Results are cached per domain.
 */
export function createDomainResolver(opts: ResolverOptions = {}): DomainResolver {
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; ttl: number; value: unknown | null }>();
  const fetcher = opts.fetcher ?? ((d: string) => fetchDomainFile(d, opts.fetch));

  async function fixture(domain: string): Promise<unknown | null> {
    if (!opts.demoDomains) return null;
    const base = opts.fixtures ?? fixturesDir;
    const dir = typeof base === "string" ? base : base.pathname.replace(/^\/([A-Za-z]:)/, "$1");
    try {
      return JSON.parse(await readFile(join(decodeURIComponent(dir), `${domain}.json`), "utf8"));
    } catch {
      return null;
    }
  }

  return async (input: string) => {
    const domain = normalizeDomain(input);
    if (!domain) return null;

    const hit = cache.get(domain);
    if (hit && now() - hit.at < hit.ttl) return hit.value;

    let value: unknown | null;
    if (domain.endsWith(".example")) value = await fixture(domain);
    else {
      const r = await fetcher(domain);
      value = r.ok ? r.value : null;
    }
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(domain, { at: now(), ttl: value === null ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS, value });
    return value;
  };
}
