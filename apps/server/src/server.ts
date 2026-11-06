// Entry point. CHAIN_MODE=mock (default) needs no keys and no network. CHAIN_MODE=testnet uses the relayer
// key and the deployed InvoiceSettler (chain 1874). See .env.example.
//
//   npm run server                              mock chain, example merchants served from fixtures
//   CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./api/app.js";
import { createChain } from "./chain/index.js";
import { createDomainChecker, createDomainResolver } from "./domain/resolver.js";
import { Scheduler } from "./scheduler.js";
import { JsonStore } from "./shared/store.js";

const env = process.env;
const port = Number(env.PORT || 8787);
const host = env.HOST || "127.0.0.1"; // local by default; set HOST deliberately to expose it
const demo = env.DEMO_DOMAINS === "1";
const storePath = env.STORE_PATH || join(fileURLToPath(new URL("../data/", import.meta.url)), "store.json");

const chain = createChain(env);
const store = new JsonStore(storePath);
const inFlight = new Set<string>(); // shared, so an invoice is never settled by the API and the scheduler at once
const scheduler = new Scheduler({ store, chain, inFlight, now: () => Math.floor(Date.now() / 1000), log: (m) => app.log.info(m) });
const app = buildApp({
  chain,
  store,
  inFlight,
  collectNow: (hash) => scheduler.collectNow(hash),
  resolveDomain: createDomainResolver({ demoDomains: demo }),
  checkDomain: createDomainChecker({ demoDomains: demo }),
  publicBaseUrl: env.PUBLIC_BASE_URL || "http://localhost:5173",
  webOrigin: env.WEB_ORIGIN || "http://localhost:5173",
  exampleMode: demo,
  logger: true,
});

chain.startScheduler();
scheduler.start();
app.listen({ port, host }).then(
  () => app.log.info(`Truce API on http://${host}:${port} (chain mode: ${env.CHAIN_MODE ?? "mock"}, example merchants: ${demo ? "on" : "off"})`),
  (err) => {
    app.log.error(err);
    process.exit(1);
  },
);
