import { existsSync, readFileSync } from "node:fs";
import { getAddress, parseEther, type Abi, type Address, type Hex } from "viem";
import { TRACK_USDT } from "@truce/invoice-lib";

const repoRoot = new URL("../../../../", import.meta.url);

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  settler: Address;
  tokens: Address[];
  explorerBase: string;
  /** Block the settler was deployed in; bounds log queries. Optional. */
  deploymentBlock?: bigint;
  /** The relayer's private key. Secret: never log it. */
  relayerKey: Hex;
  /** Daily cap on relayer gas spend, in wei of WBT. */
  dailyBudgetWei: bigint;
  /** Settle attempts allowed per caller per minute. */
  ratePerMinute: number;
  /** How long settle() waits for confirmation before reporting PENDING. */
  confirmTimeoutMs: number;
}

export const settlerAbi: Abi = JSON.parse(readFileSync(new URL("contracts/abi/InvoiceSettler.json", repoRoot), "utf8"));

/** Reads the real-chain settings. Throws a clear error for anything missing. Testnet (1874) only. */
export function loadChainConfig(env: Record<string, string | undefined> = process.env): ChainConfig {
  const need = (name: string) => {
    const v = env[name];
    if (!v) throw new Error(`${name} is not set (see .env.example)`);
    return v;
  };

  const relayerKey = need("RELAYER_PK");
  if (!/^0x[0-9a-fA-F]{64}$/.test(relayerKey)) throw new Error("RELAYER_PK is not a 32-byte hex private key");

  let settler = env.SETTLER_ADDRESS;
  let deploymentBlock: bigint | undefined;
  const file = new URL("deployments/whitechain-sepolia.json", repoRoot);
  if (existsSync(file)) {
    const rec = JSON.parse(readFileSync(file, "utf8"));
    settler ??= rec.address;
    if (rec.blockNumber !== undefined) deploymentBlock = BigInt(rec.blockNumber);
  }
  if (!settler) throw new Error("No SETTLER_ADDRESS and no deployments/whitechain-sepolia.json: deploy first.");

  return {
    chainId: 1874,
    rpcUrl: env.RPC_URL || "https://rpc.testnet.whitechain.io",
    settler: getAddress(settler),
    tokens: [TRACK_USDT],
    explorerBase: "https://explorer.testnet.whitechain.io",
    deploymentBlock,
    relayerKey: relayerKey as Hex,
    dailyBudgetWei: parseEther(env.RELAYER_DAILY_BUDGET_WBT || "0.5"),
    ratePerMinute: Number(env.RATE_LIMIT_PER_MINUTE || 10),
    confirmTimeoutMs: Number(env.CONFIRM_TIMEOUT_MS || 60_000),
  };
}
