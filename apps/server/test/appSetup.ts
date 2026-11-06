import { buildApp } from "../src/api/app.js";
import { MockChain } from "../src/chain/mock.js";
import { Scheduler } from "../src/scheduler.js";
import { JsonStore } from "../src/shared/store.js";
import { DOMAIN, PAYOUT, SETTLER, T0, merchant } from "./helpers.js";

export const domainFile = {
  version: 1,
  name: "Northlight Design Studio",
  signingAddress: merchant.address,
  payoutAddresses: [PAYOUT],
  chainIds: [1874],
};

export function setup(opts: { latencyMs?: number; authorizeWaitMs?: number } = {}) {
  let t = Number(T0);
  const chain = new MockChain({ settler: SETTLER, now: () => BigInt(t), latencyMs: opts.latencyMs });
  const store = new JsonStore(undefined, () => t);
  const inFlight = new Set<string>();
  const scheduler = new Scheduler({ store, chain, now: () => t, inFlight, marginSec: 0, retryBaseSec: 30, retryMaxSec: 600, healthEverySec: 60 });
  const app = buildApp({ chain, store, inFlight, collectNow: (h) => scheduler.collectNow(h), resolveDomain: async (d) => (d === DOMAIN ? domainFile : null), now: () => t, exampleMode: true, authorizeWaitMs: opts.authorizeWaitMs });
  return { app, chain, store, scheduler, inFlight, set: (v: number) => (t = v), advance: (s: number) => (t += s) };
}

