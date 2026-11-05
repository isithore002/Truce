import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { BuyerAuth, InvoiceDoc } from "@truce/invoice-lib";
import { settlerAbi, type ChainConfig } from "./config.js";
import { ChainError, mapChainError } from "./errors.js";
import { RateLimiter, RelayerBudget } from "./limits.js";
import type { CallMeta, ChainModule, ChainPublicConfig, HealthReason, OnchainStatus } from "./types.js";

/** The slice of a viem public client this module uses (narrow, so tests can fake it). */
export interface PublicApi {
  getChainId(): Promise<number>;
  readContract(args: any): Promise<any>;
  simulateContract(args: any): Promise<{ request: any }>;
  estimateContractGas(args: any): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
  waitForTransactionReceipt(args: any): Promise<{ status: "success" | "reverted"; gasUsed: bigint; effectiveGasPrice: bigint; l1Fee?: bigint }>;
  getContractEvents(args: any): Promise<{ transactionHash: Hex | null }[]>;
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
  private readonly relayer: Address;
  private readonly budget: RelayerBudget;
  private readonly limiter: RateLimiter;
  private chainChecked = false;

  constructor(private readonly cfg: ChainConfig, deps: ViemChainDeps = {}) {
    const account = privateKeyToAccount(cfg.relayerKey);
    this.relayer = account.address;
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
    const call = { account: this.relayer, address: this.cfg.settler, abi: settlerAbi, functionName: "settle", args } as const;

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

  // Health checks, relayed cancel and the scheduler are T12 and T13 (SHOULD features).
  async health(_doc: InvoiceDoc, _auth: BuyerAuth): Promise<{ ok: boolean; reason: HealthReason; balance: bigint }> {
    throw new ChainError("NOT_IMPLEMENTED", "Health checks are not built yet.");
  }

  async cancelAuthorization(_from: Address, _nonce: Hex, _sig: { v: number; r: Hex; s: Hex }): Promise<{ txHash: Hex }> {
    throw new ChainError("NOT_IMPLEMENTED", "Relayed cancellation is not built yet.");
  }

  startScheduler(): void {}
}
