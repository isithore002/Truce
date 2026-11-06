import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { invoiceHash, type BuyerAuth, type InvoiceDoc } from "@truce/invoice-lib";
import { settlerAbi, type ChainConfig } from "./config.js";
import { ChainError, mapChainError } from "./errors.js";
import { RateLimiter, RelayerBudget } from "./limits.js";
import type { CallMeta, ChainModule, ChainPublicConfig, ChainStatus, HealthReason, OnchainStatus, RefundAuth } from "./types.js";

/** The slice of a viem public client this module uses (narrow, so tests can fake it). */
export interface PublicApi {
  getChainId(): Promise<number>;
  readContract(args: any): Promise<any>;
  simulateContract(args: any): Promise<{ request: any }>;
  estimateContractGas(args: any): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
  waitForTransactionReceipt(args: any): Promise<{ status: "success" | "reverted"; gasUsed: bigint; effectiveGasPrice: bigint; l1Fee?: bigint }>;
  getContractEvents(args: any): Promise<{ transactionHash: Hex | null }[]>;
  getBlockNumber(): Promise<bigint>;
  getBlock(args: any): Promise<{ timestamp: bigint }>;
  getBalance(args: any): Promise<bigint>;
}

export interface WalletApi {
  writeContract(args: any): Promise<Hex>;
}

export interface ViemChainDeps {
  publicClient?: PublicApi;
  walletClient?: WalletApi;
  budget?: RelayerBudget;
  limiter?: RateLimiter;
}

/** The slice of the track USDT this module reads and calls (6 decimals, EIP-3009, blocklist). */
const tokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isBlocked", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "cancelAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const EXPIRING_SOON_SECONDS = 3600n;
const GAS_PAD_NUM = 12n; // +20% on the estimate, so a small drift between simulation and inclusion cannot fail the tx
const GAS_PAD_DEN = 10n;

/**
 * CHAIN_MODE=testnet. The relayer simulates settle() first (free) and only sends if the simulation passes,
 * so a swapped payout, an expired invoice or an empty balance is refused before it costs any gas.
 */
export class ViemChain implements ChainModule {
  readonly config: ChainPublicConfig;
  private readonly pub: PublicApi;
  private readonly wallet: WalletApi;
  /** Local account: viem signs with the key and sends a raw transaction (the public RPC has no eth_sendTransaction). */
  private readonly account: LocalAccount;
  private readonly budget: RelayerBudget;
  private readonly limiter: RateLimiter;
  private chainChecked = false;

  constructor(private readonly cfg: ChainConfig, deps: ViemChainDeps = {}) {
    const account = privateKeyToAccount(cfg.relayerKey);
    this.account = account;
    const chain = defineChain({
      id: cfg.chainId,
      name: "Whitechain Sepolia",
      nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl] } },
    });
    this.pub = deps.publicClient ?? (createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as unknown as PublicApi);
    this.wallet = deps.walletClient ?? (createWalletClient({ account, chain, transport: http(cfg.rpcUrl) }) as unknown as WalletApi);
    this.budget = deps.budget ?? new RelayerBudget(cfg.dailyBudgetWei);
    this.limiter = deps.limiter ?? new RateLimiter(cfg.ratePerMinute, 60_000);
    this.config = { chainId: cfg.chainId, settler: cfg.settler, tokens: cfg.tokens, explorerBase: cfg.explorerBase };
  }

  /** Refuses to do anything on a chain other than the configured one (testnet 1874). */
  private async assertChain() {
    if (this.chainChecked) return;
    const id = await this.pub.getChainId();
    if (id !== this.cfg.chainId) throw new ChainError("INTERNAL", `The RPC reports chain ${id}, expected ${this.cfg.chainId}. Refusing to send.`);
    this.chainChecked = true;
  }

  async settle(doc: InvoiceDoc, auth: BuyerAuth, meta?: CallMeta): Promise<{ txHash: Hex }> {
    this.limiter.check(meta?.clientKey);
    const inv = doc.invoice;
    if (auth.validBefore > inv.expiry) {
      throw new ChainError("AUTH_INVALID", "The payment authorization must not outlast the invoice's expiry.");
    }

    const args = [inv, doc.signature, { from: auth.from, validAfter: auth.validAfter, validBefore: auth.validBefore, v: auth.v, r: auth.r, s: auth.s }];
    const call = { account: this.account, address: this.cfg.settler, abi: settlerAbi, functionName: "settle", args } as const;

    let request: unknown;
    let gas: bigint;
    let gasPrice: bigint;
    try {
      await this.assertChain();
      ({ request } = await this.pub.simulateContract(call)); // a failing simulation ends here: nothing is sent
      gas = ((await this.pub.estimateContractGas(call)) * GAS_PAD_NUM) / GAS_PAD_DEN;
      gasPrice = await this.pub.getGasPrice();
    } catch (e) {
      throw mapChainError(e);
    }

    const reservation = this.budget.reserve(gas * gasPrice); // throws RELAYER_BUDGET_EXHAUSTED, nothing sent

    let txHash: Hex;
    try {
      txHash = await this.wallet.writeContract({ ...(request as object), gas });
    } catch (e) {
      reservation.release();
      throw mapChainError(e);
    }

    let receipt: Awaited<ReturnType<PublicApi["waitForTransactionReceipt"]>>;
    try {
      receipt = await this.pub.waitForTransactionReceipt({ hash: txHash, timeout: this.cfg.confirmTimeoutMs });
    } catch {
      // Sent but not confirmed in time. The reservation stays at the estimate; the status poller will catch up.
      throw new ChainError("PENDING", "The payment was sent but is not confirmed yet.", { txHash });
    }
    reservation.commit(receipt.gasUsed * receipt.effectiveGasPrice + (receipt.l1Fee ?? 0n));
    if (receipt.status !== "success") {
      throw new ChainError("SIMULATION_FAILED", "The payment transaction failed on chain.", { txHash });
    }
    return { txHash };
  }

  async onchainStatus(hash: Hex): Promise<OnchainStatus> {
    const [payer, , , refunded, paidAt] = (await this.pub.readContract({
      address: this.cfg.settler,
      abi: settlerAbi,
      functionName: "payments",
      args: [hash],
    })) as [Address, Address, bigint, bigint, bigint];
    if (paidAt === 0n) return { paid: false, refunded: 0n };

    let txHash: Hex | undefined;
    if (this.cfg.deploymentBlock !== undefined) {
      try {
        const logs = await this.pub.getContractEvents({
          address: this.cfg.settler,
          abi: settlerAbi,
          eventName: "InvoicePaid",
          args: { hash },
          fromBlock: this.cfg.deploymentBlock,
        });
        txHash = logs[0]?.transactionHash ?? undefined;
      } catch {
        txHash = undefined; // the link is a nicety; the paid status is what matters
      }
    }
    return { paid: true, refunded, payer, txHash };
  }

  async status(): Promise<ChainStatus> {
    const chainId = await this.pub.getChainId();
    const blockNumber = await this.pub.getBlockNumber();
    const block = await this.pub.getBlock({ blockNumber });
    const wbtBalance = await this.pub.getBalance({ address: this.account.address });
    return {
      mode: "testnet",
      chainId,
      blockNumber,
      lagSeconds: Math.max(0, Math.floor(Date.now() / 1000) - Number(block.timestamp)),
      relayer: { address: this.account.address, wbtBalance },
    };
  }

  /**
   * A snapshot, not a lock: could this authorization settle right now? Reads only, costs nothing.
   * Order matches the mock: blocked, used or cancelled, low balance, expiring soon.
   */
  async health(doc: InvoiceDoc, auth: BuyerAuth): Promise<{ ok: boolean; reason: HealthReason; balance: bigint }> {
    const inv = doc.invoice;
    const hash = invoiceHash(inv, { chainId: this.cfg.chainId, verifyingContract: this.cfg.settler });
    try {
      await this.assertChain();
      const [balance, used, blocked, block] = await Promise.all([
        this.pub.readContract({ address: inv.token, abi: tokenAbi, functionName: "balanceOf", args: [auth.from] }) as Promise<bigint>,
        this.pub.readContract({ address: inv.token, abi: tokenAbi, functionName: "authorizationState", args: [auth.from, hash] }) as Promise<boolean>,
        // A token without a blocklist simply has no isBlocked: treat a failed read as "not blocked".
        (this.pub.readContract({ address: inv.token, abi: tokenAbi, functionName: "isBlocked", args: [auth.from] }) as Promise<boolean>).catch(() => false),
        this.pub.getBlock({ blockTag: "latest" }),
      ]);
      const reason: HealthReason = blocked
        ? "BLOCKED"
        : used
          ? "AUTH_CANCELLED"
          : balance < inv.amount
            ? "LOW_BALANCE"
            : auth.validBefore - block.timestamp < EXPIRING_SOON_SECONDS
              ? "AUTH_EXPIRING"
              : "NONE";
      return { ok: reason === "NONE", reason, balance };
    } catch (e) {
      throw mapChainError(e);
    }
  }

  /** Relays the buyer's signed CancelAuthorization (the buyer signs; the relayer pays the gas). Simulates first. */
  async cancelAuthorization(from: Address, nonce: Hex, sig: { v: number; r: Hex; s: Hex }): Promise<{ txHash: Hex }> {
    const token = this.cfg.tokens[0];
    const call = { account: this.account, address: token, abi: tokenAbi, functionName: "cancelAuthorization", args: [from, nonce, sig.v, sig.r, sig.s] } as const;
    let request: unknown;
    let gas: bigint;
    let gasPrice: bigint;
    try {
      await this.assertChain();
      ({ request } = await this.pub.simulateContract(call));
      gas = ((await this.pub.estimateContractGas(call)) * GAS_PAD_NUM) / GAS_PAD_DEN;
      gasPrice = await this.pub.getGasPrice();
    } catch (e) {
      throw mapChainError(e);
    }
    const reservation = this.budget.reserve(gas * gasPrice);
    let txHash: Hex;
    try {
      txHash = await this.wallet.writeContract({ ...(request as object), gas });
    } catch (e) {
      reservation.release();
      throw mapChainError(e);
    }
    try {
      const receipt = await this.pub.waitForTransactionReceipt({ hash: txHash, timeout: this.cfg.confirmTimeoutMs });
      reservation.commit(receipt.gasUsed * receipt.effectiveGasPrice + (receipt.l1Fee ?? 0n));
      if (receipt.status !== "success") throw new ChainError("SIMULATION_FAILED", "The cancellation failed on chain.", { txHash });
    } catch (e) {
      if (e instanceof ChainError) throw e;
      throw new ChainError("PENDING", "The cancellation was sent but is not confirmed yet.", { txHash });
    }
    return { txHash };
  }

  /**
   * Relays the payout wallet's signed refund (the wallet signs; the relayer pays the gas). The contract fixes the
   * nonce, the recipient (the payer recorded at settlement) and the cap, so this method cannot redirect money.
   * Simulates first: a refund the contract would reject sends nothing and costs nothing.
   */
  async refund(hash: Hex, amount: bigint, auth: RefundAuth, meta?: CallMeta): Promise<{ txHash: Hex }> {
    this.limiter.check(meta?.clientKey);
    const args = [hash, amount, { from: auth.from, validAfter: auth.validAfter, validBefore: auth.validBefore, v: auth.v, r: auth.r, s: auth.s }] as const;
    const call = { account: this.account, address: this.cfg.settler, abi: settlerAbi, functionName: "refund", args } as const;
    let request: unknown;
    let gas: bigint;
    let gasPrice: bigint;
    try {
      await this.assertChain();
      ({ request } = await this.pub.simulateContract(call));
      gas = ((await this.pub.estimateContractGas(call)) * GAS_PAD_NUM) / GAS_PAD_DEN;
      gasPrice = await this.pub.getGasPrice();
    } catch (e) {
      throw mapChainError(e);
    }
    const reservation = this.budget.reserve(gas * gasPrice);
    let txHash: Hex;
    try {
      txHash = await this.wallet.writeContract({ ...(request as object), gas });
    } catch (e) {
      reservation.release();
      throw mapChainError(e);
    }
    try {
      const receipt = await this.pub.waitForTransactionReceipt({ hash: txHash, timeout: this.cfg.confirmTimeoutMs });
      reservation.commit(receipt.gasUsed * receipt.effectiveGasPrice + (receipt.l1Fee ?? 0n));
      if (receipt.status !== "success") throw new ChainError("SIMULATION_FAILED", "The refund failed on chain.", { txHash });
    } catch (e) {
      if (e instanceof ChainError) throw e;
      throw new ChainError("PENDING", "The refund was sent but is not confirmed yet.", { txHash });
    }
    return { txHash };
  }

  startScheduler(): void {}
}
