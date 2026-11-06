import { ContractFunctionRevertedError, encodeErrorResult, parseAbi, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ChainError } from "../src/chain/errors.js";
import { RateLimiter, RelayerBudget } from "../src/chain/limits.js";
import { ViemChain, type PublicApi, type WalletApi } from "../src/chain/viem.js";
import type { ChainConfig } from "../src/chain/config.js";
import { PAYOUT, SETTLER, makeAuth, makeDoc } from "./helpers.js";
import { TRACK_USDT } from "@truce/invoice-lib";

const TX: Hex = "0x" + "ab".repeat(32) as Hex;
const errorsAbi = parseAbi(["error BadMerchantSignature()", "error AlreadyPaid()"]);

const cfg: ChainConfig = {
  chainId: 1874,
  rpcUrl: "http://rpc.invalid",
  settler: SETTLER,
  tokens: [TRACK_USDT],
  explorerBase: "https://explorer.testnet.whitechain.io",
  relayerKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // public Anvil key 3
  dailyBudgetWei: 10n ** 18n,
  ratePerMinute: 10,
  confirmTimeoutMs: 1000,
};

function revert(name: string) {
  const data = encodeErrorResult({ abi: errorsAbi, errorName: name } as never);
  return new ContractFunctionRevertedError({ abi: errorsAbi as never, data, functionName: "settle" });
}

function tokenRevert(reason: string) {
  const abi = parseAbi(["error Error(string message)"]);
  const data = encodeErrorResult({ abi, errorName: "Error", args: [reason] } as never);
  return new ContractFunctionRevertedError({ abi: abi as never, data, functionName: "cancelAuthorization" });
}

function fakes(over: Partial<PublicApi> = {}) {
  const pub = {
    getChainId: vi.fn(async () => 1874),
    readContract: vi.fn(),
    simulateContract: vi.fn(async () => ({ request: { simulated: true } })),
    estimateContractGas: vi.fn(async () => 200_000n),
    getGasPrice: vi.fn(async () => 10_000_000_000n), // 10 gwei
    waitForTransactionReceipt: vi.fn(async () => ({ status: "success" as const, gasUsed: 150_000n, effectiveGasPrice: 10_000_000_000n })),
    getContractEvents: vi.fn(async () => []),
    getBlockNumber: vi.fn(async () => 12_345n),
    getBlock: vi.fn(async () => ({ timestamp: BigInt(Math.floor(Date.now() / 1000) - 3) })),
    getBalance: vi.fn(async () => 5n * 10n ** 16n),
    ...over,
  };
  const wallet = { writeContract: vi.fn(async (_args: unknown) => TX) } satisfies WalletApi;
  return { pub, wallet };
}

function make(over: Partial<PublicApi> = {}, extra: { budget?: RelayerBudget; limiter?: RateLimiter } = {}) {
  const { pub, wallet } = fakes(over);
  const budget = extra.budget ?? new RelayerBudget(cfg.dailyBudgetWei);
  const chain = new ViemChain(cfg, { publicClient: pub, walletClient: wallet, budget, limiter: extra.limiter });
  return { chain, pub, wallet, budget };
}

describe("ViemChain.settle", () => {
  it("simulates, then sends once, and returns the transaction hash", async () => {
    const { chain, pub, wallet } = make();
    const doc = await makeDoc();
    const out = await chain.settle(doc, await makeAuth(doc));
    expect(out.txHash).toBe(TX);
    expect(pub.simulateContract).toHaveBeenCalledTimes(1);
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    // gas is the estimate plus 20%
    expect(wallet.writeContract.mock.calls[0][0]).toMatchObject({ simulated: true, gas: 240_000n });
  });

  it("simulates and sends with the local relayer account, so viem signs locally (no eth_sendTransaction)", async () => {
    const { chain, pub } = make();
    const doc = await makeDoc();
    await chain.settle(doc, await makeAuth(doc));
    const sim = pub.simulateContract as unknown as { mock: { calls: [{ account: { type: string; signTransaction?: unknown } }][] } };
    const account = sim.mock.calls[0][0].account;
    expect(account.type).toBe("local");
    expect(typeof account.signTransaction).toBe("function");
  });

  it("a failing simulation sends nothing and costs nothing (swapped payout)", async () => {
    const { chain, wallet, budget } = make({
      simulateContract: vi.fn(async () => {
        throw revert("BadMerchantSignature");
      }),
    });
    const doc = await makeDoc();
    const swapped = { ...doc, invoice: { ...doc.invoice, payout: PAYOUT } };
    await expect(chain.settle(swapped, await makeAuth(doc))).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(budget.spentWei()).toBe(0n);
  });

  it("maps an already-paid simulation to ALREADY_PAID without sending", async () => {
    const { chain, wallet } = make({
      simulateContract: vi.fn(async () => {
        throw revert("AlreadyPaid");
      }),
    });
    const doc = await makeDoc();
    await expect(chain.settle(doc, await makeAuth(doc))).rejects.toMatchObject({ code: "ALREADY_PAID" });
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("refuses an authorization that outlasts the invoice, before any RPC call", async () => {
    const { chain, pub } = make();
    const doc = await makeDoc();
    const auth = { ...(await makeAuth(doc)), validBefore: doc.invoice.expiry + 1n };
    await expect(chain.settle(doc, auth)).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect(pub.getChainId).not.toHaveBeenCalled();
    expect(pub.simulateContract).not.toHaveBeenCalled();
  });

  it("refuses to send on the wrong chain", async () => {
    const { chain, wallet } = make({ getChainId: vi.fn(async () => 1875) });
    const doc = await makeDoc();
    await expect(chain.settle(doc, await makeAuth(doc))).rejects.toMatchObject({ code: "INTERNAL" });
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("stops at the budget cap after simulating, before sending", async () => {
    const { chain, wallet } = make({}, { budget: new RelayerBudget(1n) });
    const doc = await makeDoc();
    await expect(chain.settle(doc, await makeAuth(doc))).rejects.toMatchObject({ code: "RELAYER_BUDGET_EXHAUSTED" });
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("rate limits before touching the RPC", async () => {
    const { chain, pub } = make({}, { limiter: new RateLimiter(1, 60_000) });
    const doc = await makeDoc();
    const auth = await makeAuth(doc);
    await chain.settle(doc, auth, { clientKey: "9.9.9.9" });
    await expect(chain.settle(doc, auth, { clientKey: "9.9.9.9" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(pub.simulateContract).toHaveBeenCalledTimes(1);
  });

  it("records the real gas cost against the budget after confirmation", async () => {
    const { chain, budget } = make();
    const doc = await makeDoc();
    await chain.settle(doc, await makeAuth(doc));
    expect(budget.spentWei()).toBe(150_000n * 10_000_000_000n);
  });

  it("reports PENDING with the tx hash when confirmation times out", async () => {
    const { chain } = make({
      waitForTransactionReceipt: vi.fn(async () => {
        throw new Error("timed out");
      }),
    });
    const doc = await makeDoc();
    const err = await chain.settle(doc, await makeAuth(doc)).catch((e) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect(err).toMatchObject({ code: "PENDING", details: { txHash: TX } });
  });

  it("reports a transaction that reverted on chain, with its hash", async () => {
    const { chain } = make({ waitForTransactionReceipt: vi.fn(async () => ({ status: "reverted" as const, gasUsed: 100_000n, effectiveGasPrice: 10_000_000_000n })) });
    const doc = await makeDoc();
    const err = await chain.settle(doc, await makeAuth(doc)).catch((e) => e);
    expect(err).toMatchObject({ code: "SIMULATION_FAILED", details: { txHash: TX } });
  });

  it("frees the budget reservation if sending fails", async () => {
    const { pub, budget } = make();
    const failing = { writeContract: vi.fn(async () => { throw new Error("nonce too low"); }) };
    const chain = new ViemChain(cfg, { publicClient: pub, walletClient: failing, budget });
    const doc = await makeDoc();
    await expect(chain.settle(doc, await makeAuth(doc))).rejects.toMatchObject({ code: "INTERNAL" });
    expect(budget.spentWei()).toBe(0n);
  });
});

describe("ViemChain.onchainStatus", () => {
  it("reports unpaid when paidAt is zero", async () => {
    const { chain } = make({ readContract: vi.fn(async () => ["0x0000000000000000000000000000000000000000", PAYOUT, 0n, 0n, 0n]) });
    expect(await chain.onchainStatus(TX)).toEqual({ paid: false, refunded: 0n });
  });

  it("reports paid with the payer and survives a failing log query", async () => {
    const { chain } = make({
      readContract: vi.fn(async () => [PAYOUT, PAYOUT, 5n, 0n, 1_800_000_000n]),
      getContractEvents: vi.fn(async () => {
        throw new Error("range too large");
      }),
    });
    expect(await chain.onchainStatus(TX)).toEqual({ paid: true, refunded: 0n, payer: PAYOUT, txHash: undefined });
  });

  it("finds the transaction hash from the InvoicePaid log when the deployment block is known", async () => {
    const { pub, wallet, budget } = make({
      readContract: vi.fn(async () => [PAYOUT, PAYOUT, 5n, 0n, 1_800_000_000n]),
      getContractEvents: vi.fn(async () => [{ transactionHash: TX }]),
    });
    const chain = new ViemChain({ ...cfg, deploymentBlock: 100n }, { publicClient: pub, walletClient: wallet, budget });
    expect(await chain.onchainStatus(TX)).toMatchObject({ paid: true, txHash: TX });
    expect(pub.getContractEvents).toHaveBeenCalledWith(expect.objectContaining({ fromBlock: 100n }));
  });
});

describe("ViemChain.status", () => {
  it("reports the chain, block lag and the relayer balance for /healthz", async () => {
    const { chain } = make();
    const st = await chain.status();
    expect(st).toMatchObject({ mode: "testnet", chainId: 1874, blockNumber: 12_345n });
    expect(st.lagSeconds).toBeGreaterThanOrEqual(3);
    expect(st.relayer?.wbtBalance).toBe(5n * 10n ** 16n);
    expect(st.relayer?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

/** readContract answers by function name, so each health input can be set independently. */
function reads(values: { balanceOf?: bigint; authorizationState?: boolean; isBlocked?: boolean | Error }) {
  return vi.fn(async (args: { functionName: string }) => {
    const v = (values as Record<string, unknown>)[args.functionName];
    if (v instanceof Error) throw v;
    return v;
  });
}

describe("ViemChain.health (a snapshot, not a lock)", () => {
  const healthy = { balanceOf: 2_000_000_000n, authorizationState: false, isBlocked: false };
  const now = Math.floor(Date.now() / 1000);

  async function check(values: Parameters<typeof reads>[0], validBeforeIn = 10 * 86_400) {
    const { chain } = make({ readContract: reads({ ...healthy, ...values }) });
    const doc = await makeDoc();
    const auth = { ...(await makeAuth(doc)), validBefore: BigInt(now + validBeforeIn) };
    return chain.health(doc, auth);
  }

  it("is OK when the balance covers the invoice, the authorization is unused and the wallet is not blocked", async () => {
    expect(await check({})).toEqual({ ok: true, reason: "NONE", balance: 2_000_000_000n });
  });
  it("flags a low balance with the balance it saw", async () => {
    expect(await check({ balanceOf: 5n })).toMatchObject({ ok: false, reason: "LOW_BALANCE", balance: 5n });
  });
  it("flags a used or cancelled authorization", async () => {
    expect(await check({ authorizationState: true })).toMatchObject({ ok: false, reason: "AUTH_CANCELLED" });
  });
  it("flags a blocked wallet before anything else", async () => {
    expect(await check({ isBlocked: true, balanceOf: 0n, authorizationState: true })).toMatchObject({ reason: "BLOCKED" });
  });
  it("flags an authorization that expires within an hour", async () => {
    expect(await check({}, 600)).toMatchObject({ ok: false, reason: "AUTH_EXPIRING" });
  });
  it("treats a token without isBlocked as not blocked", async () => {
    expect(await check({ isBlocked: new Error("execution reverted") })).toMatchObject({ ok: true, reason: "NONE" });
  });
  it("reports an unreachable chain instead of a false OK", async () => {
    const { chain } = make({ readContract: vi.fn(async () => { throw new Error("fetch failed"); }) });
    const doc = await makeDoc();
    await expect(chain.health(doc, await makeAuth(doc))).rejects.toBeInstanceOf(ChainError);
  });
});

describe("ViemChain.cancelAuthorization", () => {
  it("simulates, then relays the buyer's signed cancel to the token", async () => {
    const { chain, pub, wallet } = make();
    const out = await chain.cancelAuthorization(PAYOUT, TX, { v: 27, r: TX, s: TX });
    expect(out.txHash).toBe(TX);
    expect(pub.simulateContract).toHaveBeenCalledTimes(1);
    expect((pub.simulateContract as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toMatchObject({ address: TRACK_USDT, functionName: "cancelAuthorization", args: [PAYOUT, TX, 27, TX, TX] });
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });
  it("sends nothing when the simulation fails (already used or bad signature)", async () => {
    const { chain, wallet } = make({ simulateContract: vi.fn(async () => { throw tokenRevert("TetherToken: auth invalid"); }) });
    await expect(chain.cancelAuthorization(PAYOUT, TX, { v: 27, r: TX, s: TX })).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });
});

describe("ViemChain.refund", () => {
  const refundErrors = parseAbi(["error NotPaid()", "error NotPayout()", "error RefundExceedsPaid()"]);
  const contractRevert = (name: string) =>
    new ContractFunctionRevertedError({ abi: refundErrors as never, data: encodeErrorResult({ abi: refundErrors, errorName: name } as never), functionName: "refund" });
  const auth = { from: PAYOUT, validAfter: 0n, validBefore: 9_999_999_999n, v: 27, r: TX, s: TX };

  it("simulates, then sends the payout wallet's signed refund to the settler", async () => {
    const { chain, pub, wallet } = make();
    const out = await chain.refund(TX, 5_000n, auth);
    expect(out.txHash).toBe(TX);
    expect(pub.simulateContract).toHaveBeenCalledTimes(1);
    expect((pub.simulateContract as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toMatchObject({
      address: SETTLER,
      functionName: "refund",
      args: [TX, 5_000n, { from: PAYOUT, validAfter: 0n, validBefore: 9_999_999_999n, v: 27, r: TX, s: TX }],
    });
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["NotPaid", "NOT_PAID"],
    ["NotPayout", "AUTH_INVALID"],
    ["RefundExceedsPaid", "REFUND_EXCEEDS_PAID"],
  ])("maps the contract's %s revert to %s and sends nothing", async (name, code) => {
    const { chain, wallet, budget } = make({ simulateContract: vi.fn(async () => { throw contractRevert(name); }) });
    await expect(chain.refund(TX, 5_000n, auth)).rejects.toMatchObject({ code });
    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(budget.spentWei()).toBe(0n);
  });

  it("stops at the budget cap after simulating, before sending", async () => {
    const { chain, wallet } = make({}, { budget: new RelayerBudget(1n) });
    await expect(chain.refund(TX, 5_000n, auth)).rejects.toMatchObject({ code: "RELAYER_BUDGET_EXHAUSTED" });
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("rate limits per caller before touching the chain", async () => {
    const { chain, pub } = make({}, { limiter: new RateLimiter(1, 60_000) });
    await chain.refund(TX, 1n, auth, { clientKey: "1.2.3.4" });
    await expect(chain.refund(TX, 1n, auth, { clientKey: "1.2.3.4" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(pub.simulateContract).toHaveBeenCalledTimes(1);
  });

  it("records the real gas cost against the budget and reports a slow confirmation as PENDING", async () => {
    const ok = make();
    await ok.chain.refund(TX, 1n, auth);
    expect(ok.budget.spentWei()).toBe(150_000n * 10_000_000_000n);

    const slow = make({ waitForTransactionReceipt: vi.fn(async () => { throw new Error("timeout"); }) });
    await expect(slow.chain.refund(TX, 1n, auth)).rejects.toMatchObject({ code: "PENDING", details: { txHash: TX } });
  });
});
