import Fastify, { type FastifyInstance } from "fastify";
import type { DomainResolver } from "@truce/invoice-lib";
import type { Hex } from "viem";
import type { ChainModule } from "../chain/types.js";
import type { FetchResult } from "../domain/fetchDomainFile.js";
import type { Store } from "../shared/store.js";
import { errorBody, errorHandler } from "./errors.js";
import { registerRoutes } from "./routes.js";

export interface AppDeps {
  chain: ChainModule;
  store: Store;
  /** Fetches a merchant's /.well-known/truce.json (SSRF-guarded in production). */
  resolveDomain: DomainResolver;
  /** Fresh, uncached read of a domain file with the failure reason, for the setup page's check. Defaults to resolveDomain. */
  checkDomain?: (domain: string) => Promise<FetchResult>;
  /** Unix seconds. Injectable so tests can move time. */
  now?: () => number;
  /** Where payment links point (the web app). */
  publicBaseUrl?: string;
  /** Origin allowed to call the API from a browser. */
  webOrigin?: string;
  /** How long /authorize waits for confirmation before answering 202 PENDING. */
  authorizeWaitMs?: number;
  /** Hashes being settled right now; share it with the Scheduler so nothing is sent twice at once. */
  inFlight?: Set<string>;
  /** Lets the merchant trigger a due-date collection immediately (Scheduler.collectNow). */
  collectNow?: (hash: Hex) => Promise<string>;
  /** True when fictional *.example merchant domains are served from local fixtures. */
  exampleMode?: boolean;
  logger?: boolean;
}

export interface AppContext extends Required<Pick<AppDeps, "chain" | "store" | "resolveDomain" | "checkDomain" | "now" | "publicBaseUrl" | "exampleMode" | "authorizeWaitMs" | "inFlight">> {
  collectNow?: (hash: Hex) => Promise<string>;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 64 * 1024, trustProxy: false });
  const ctx: AppContext = {
    chain: deps.chain,
    store: deps.store,
    resolveDomain: deps.resolveDomain,
    checkDomain:
      deps.checkDomain ??
      (async (d) => {
        const value = await deps.resolveDomain(d);
        return value === null || value === undefined ? { ok: false, reason: "no file found there" } : { ok: true, value };
      }),
    now: deps.now ?? (() => Math.floor(Date.now() / 1000)),
    publicBaseUrl: (deps.publicBaseUrl ?? "http://localhost:5173").replace(/\/$/, ""),
    exampleMode: deps.exampleMode ?? false,
    authorizeWaitMs: deps.authorizeWaitMs ?? 15_000,
    inFlight: deps.inFlight ?? new Set<string>(),
    collectNow: deps.collectNow,
  };
  const origin = deps.webOrigin ?? "http://localhost:5173";

  app.addHook("onRequest", async (req, reply) => {
    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "origin");
    reply.header("x-content-type-options", "nosniff");
    if (req.method === "OPTIONS") {
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
      reply.header("access-control-allow-headers", "content-type");
      return reply.status(204).send();
    }
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_req, reply) => reply.status(404).send(errorBody("NOT_FOUND", "No such endpoint.")));

  registerRoutes(app, ctx);
  return app;
}
