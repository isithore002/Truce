import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { loadChainConfig, type ChainConfig } from "../src/chain/config.js";
import { ViemChain } from "../src/chain/viem.js";
import { SETTLER } from "./helpers.js";

// Two tiny JSON-RPC servers stand in for the primary and the backup node.
// Public Anvil key 3: holds no funds, used only to build a client.
const KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

interface FakeNode {
  url: string;
  calls: string[];
  server: Server;
}
const nodes: Server[] = [];

async function node(mode: "ok" | "down"): Promise<FakeNode> {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const rpc = JSON.parse(body || "{}") as { id: number; method: string };
      calls.push(rpc.method);
      if (mode === "down") {
        res.writeHead(500, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "node unavailable" }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: rpc.method === "eth_chainId" ? "0x752" : "0x0" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  nodes.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls, server };
}
afterEach(async () => {
  await Promise.all(nodes.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

const cfg = (over: Partial<ChainConfig>): ChainConfig => ({
  chainId: 1874, rpcUrl: "http://127.0.0.1:1", settler: SETTLER, tokens: [], explorerBase: "https://explorer.invalid",
  relayerKey: KEY, dailyBudgetWei: 10n ** 18n, ratePerMinute: 10, confirmTimeoutMs: 1000, ...over,
});
const readClient = (chain: ViemChain) => (chain as unknown as { pub: { getChainId(): Promise<number> } }).pub;

describe("read-only RPC fallback", () => {
  it("answers from the backup when the primary is down", async () => {
    const primary = await node("down");
    const backup = await node("ok");
    const chain = new ViemChain(cfg({ rpcUrl: primary.url, fallbackRpcUrl: backup.url }));
    expect(await readClient(chain).getChainId()).toBe(1874);
    expect(primary.calls.length).toBeGreaterThan(0); // the primary was tried first
    expect(backup.calls).toContain("eth_chainId");
  }, 20_000);

  it("does not touch the backup while the primary is healthy", async () => {
    const primary = await node("ok");
    const backup = await node("ok");
    const chain = new ViemChain(cfg({ rpcUrl: primary.url, fallbackRpcUrl: backup.url }));
    expect(await readClient(chain).getChainId()).toBe(1874);
    expect(backup.calls).toEqual([]);
  });

  it("fails as before when there is no backup configured", async () => {
    const primary = await node("down");
    const chain = new ViemChain(cfg({ rpcUrl: primary.url }));
    await expect(readClient(chain).getChainId()).rejects.toBeTruthy();
  }, 20_000);
});

describe("loadChainConfig fallback setting", () => {
  const env = { RELAYER_PK: KEY, SETTLER_ADDRESS: SETTLER };
  it("defaults to the documented backup RPC", () => {
    expect(loadChainConfig(env).fallbackRpcUrl).toBe("https://rpc.ankr.com/whitechain_testnet");
  });
  it("uses a custom backup, and can be turned off", () => {
    expect(loadChainConfig({ ...env, RPC_FALLBACK_URL: "https://backup.example/rpc" }).fallbackRpcUrl).toBe("https://backup.example/rpc");
    expect(loadChainConfig({ ...env, RPC_FALLBACK_URL: "none" }).fallbackRpcUrl).toBeUndefined();
    expect(loadChainConfig({ ...env, RPC_FALLBACK_URL: "NONE" }).fallbackRpcUrl).toBeUndefined();
  });
});
