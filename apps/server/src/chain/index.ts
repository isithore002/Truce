import { loadChainConfig } from "./config.js";
import { MockChain } from "./mock.js";
import type { ChainModule } from "./types.js";
import { ViemChain } from "./viem.js";

export type { ChainModule } from "./types.js";
export { ChainError } from "./errors.js";

/** CHAIN_MODE=mock (default): no keys, no network. CHAIN_MODE=testnet: Whitechain Sepolia (chain 1874). */
export function createChain(env: Record<string, string | undefined> = process.env): ChainModule {
  const mode = env.CHAIN_MODE ?? "mock";
  if (mode === "mock") return new MockChain({ latencyMs: Number(env.MOCK_LATENCY_MS || 0) });
  if (mode === "testnet") return new ViemChain(loadChainConfig(env));
  throw new Error(`CHAIN_MODE must be "mock" or "testnet", got "${mode}"`);
}
