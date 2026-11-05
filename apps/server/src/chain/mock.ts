import { concat, keccak256, recoverTypedDataAddress, toHex, type Address, type Hex } from "viem";
import {
  CANCEL_AUTHORIZATION_TYPES,
  RECEIVE_AUTHORIZATION_TYPES,
  TRACK_USDT,
  invoiceHash,
  recoverMerchant,
  tokenDomain,
  type BuyerAuth,
  type InvoiceDoc,
} from "@truce/invoice-lib";
import { ChainError } from "./errors.js";
import type { CallMeta, ChainModule, ChainPublicConfig, ChainStatus, HealthReason, OnchainStatus } from "./types.js";

export interface MockChainOptions {
  chainId?: number;
  settler?: Address;
  tokens?: Address[];
  /** Unix seconds. Injectable so tests and the demo can move time. */
  now?: () => bigint;
  /** Simulated confirmation delay, so the UI can show a pending state. */
  latencyMs?: number;
  /** Balance given to any wallet that has not been set explicitly (token base units). */
  defaultBalance?: bigint;
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sigOf = (v: number, r: Hex, s: Hex): Hex => concat([r, s, v === 27 ? "0x1b" : "0x1c"]);

interface MockPayment {
  payer: Address;
  payout: Address;
  amount: bigint;
  txHash: Hex;
}

/**
 * CHAIN_MODE=mock. No network, no keys. It applies the same rules as InvoiceSettler and the token, in the
 * same order and with the same error codes, so the swapped-payout failure and the other states can be
 * built and demoed without the chain. It is a stand-in, not a proof: the real module is the source of truth.
 */
export class MockChain implements ChainModule {
  readonly config: ChainPublicConfig;
  private readonly now: () => bigint;
  private readonly latencyMs: number;
  private readonly defaultBalance: bigint;
  private readonly balances = new Map<string, bigint>();
  private readonly blocked = new Set<string>();
  private readonly usedNonces = new Set<string>(); // `${from}:${nonce}`, used or cancelled
  private readonly payments = new Map<string, MockPayment>();
  private forced: ChainError[] = [];
  private txCounter = 0;

  constructor(opts: MockChainOptions = {}) {
    this.config = {
      chainId: opts.chainId ?? 1874,
      settler: opts.settler ?? "0x00000000000000000000000000005e77100000e1",
      tokens: opts.tokens ?? [TRACK_USDT],
      explorerBase: "https://explorer.testnet.whitechain.io",
    };
    this.now = opts.now ?? (() => BigInt(Math.floor(Date.now() / 1000)));
    this.latencyMs = opts.latencyMs ?? 0;
    this.defaultBalance = opts.defaultBalance ?? 10_000_000_000n; // 10,000 USDT
  }

  // ---- scripting hooks for tests and the demo ----
  setBalance(wallet: Address, amount: bigint) {
    this.balances.set(wallet.toLowerCase(), amount);
  }
  setBlocked(wallet: Address, blocked = true) {
    if (blocked) this.blocked.add(wallet.toLowerCase());
    else this.blocked.delete(wallet.toLowerCase());
  }
  /** The next settle() call fails with this error, whatever the invoice. */
  failNextSettle(err: ChainError) {
    this.forced.push(err);
  }
  balanceOf(wallet: Address): bigint {
    return this.balances.get(wallet.toLowerCase()) ?? this.defaultBalance;
  }

  private signingCtx() {
    return { chainId: this.config.chainId, verifyingContract: this.config.settler };
  }

  private tokenCtx(token: Address) {
    return { chainId: this.config.chainId, token };
  }

  private fakeTx(seed: Hex): Hex {
    return keccak256(concat([seed, toHex(++this.txCounter, { size: 32 })]));
  }

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  /** The token's view of the buyer authorization: signature, window and nonce. */
  private async checkAuth(doc: InvoiceDoc, auth: BuyerAuth, hash: Hex) {
    const inv = doc.invoice;
    const message = { from: auth.from, to: this.config.settler, value: inv.amount, validAfter: auth.validAfter, validBefore: auth.validBefore, nonce: hash };
    let signer: Address | undefined;
    try {
      signer = await recoverTypedDataAddress({
        domain: tokenDomain(this.tokenCtx(inv.token)),
        types: RECEIVE_AUTHORIZATION_TYPES,
        primaryType: "ReceiveWithAuthorization",
        message,
        signature: sigOf(auth.v, auth.r, auth.s),
      });
    } catch {
      signer = undefined;
    }
    if (!signer || !same(signer, auth.from)) {
      throw new ChainError("AUTH_INVALID", "The buyer's payment authorization is not valid (wrong signature, amount or recipient).");
    }
    const t = this.now();
    if (!(t > auth.validAfter)) throw new ChainError("AUTH_INVALID", "The buyer's payment authorization is not valid yet.");
    if (!(t < auth.validBefore)) throw new ChainError("AUTH_INVALID", "The buyer's payment authorization has expired.");
    if (this.usedNonces.has(`${auth.from.toLowerCase()}:${hash}`)) {
      throw new ChainError("AUTH_INVALID", "The buyer's payment authorization was already used or cancelled.");
    }
  }

  async settle(doc: InvoiceDoc, auth: BuyerAuth, _meta?: CallMeta): Promise<{ txHash: Hex }> {
    await this.delay();
    const forced = this.forced.shift();
    if (forced) throw forced;

    const inv = doc.invoice;
    const hash = invoiceHash(inv, this.signingCtx());
    // Same order as InvoiceSettler.settle
    if (this.now() > inv.expiry) throw new ChainError("EXPIRED", "This invoice has expired.");
    if (!this.config.tokens.some((t) => same(t, inv.token))) throw new ChainError("TOKEN_NOT_ALLOWED", "The payment contract does not accept this token.");
    if (inv.amount === 0n || inv.payout === ZERO) throw new ChainError("INVALID_DOCUMENT", "The invoice has an invalid amount or payout.");
    if (!same(inv.payer, ZERO) && !same(inv.payer, auth.from)) throw new ChainError("WRONG_PAYER", "This invoice can only be paid by a different wallet.");
    if (this.payments.has(hash)) throw new ChainError("ALREADY_PAID", "This invoice has already been paid.");
    let merchant: Address | undefined;
    try {
      merchant = await recoverMerchant(inv, doc.signature, this.signingCtx());
    } catch {
      merchant = undefined;
    }
    if (!merchant || !same(merchant, inv.merchant)) {
      throw new ChainError("SIGNATURE_INVALID", "The merchant's signature does not match this invoice. Do not pay it.");
    }
    await this.checkAuth(doc, auth, hash);
    if (this.balanceOf(auth.from) < inv.amount) throw new ChainError("INSUFFICIENT_BALANCE", "The buyer's balance is too low to pay this invoice.");

    this.balances.set(auth.from.toLowerCase(), this.balanceOf(auth.from) - inv.amount);
    this.balances.set(inv.payout.toLowerCase(), this.balanceOf(inv.payout) + inv.amount);
    this.usedNonces.add(`${auth.from.toLowerCase()}:${hash}`);
    const txHash = this.fakeTx(hash);
    this.payments.set(hash, { payer: auth.from, payout: inv.payout, amount: inv.amount, txHash });
    return { txHash };
  }

  async health(doc: InvoiceDoc, auth: BuyerAuth): Promise<{ ok: boolean; reason: HealthReason; balance: bigint }> {
    const hash = invoiceHash(doc.invoice, this.signingCtx());
    const balance = this.balanceOf(auth.from);
    const reason: HealthReason = this.blocked.has(auth.from.toLowerCase())
      ? "BLOCKED"
      : this.usedNonces.has(`${auth.from.toLowerCase()}:${hash}`)
        ? "AUTH_CANCELLED"
        : balance < doc.invoice.amount
          ? "LOW_BALANCE"
          : auth.validBefore - this.now() < 3600n
            ? "AUTH_EXPIRING"
            : "NONE";
    return { ok: reason === "NONE", reason, balance };
  }

  async cancelAuthorization(from: Address, nonce: Hex, sig: { v: number; r: Hex; s: Hex }): Promise<{ txHash: Hex }> {
    await this.delay();
    let signer: Address | undefined;
    try {
      signer = await recoverTypedDataAddress({
        domain: tokenDomain(this.tokenCtx(this.config.tokens[0])),
        types: CANCEL_AUTHORIZATION_TYPES,
        primaryType: "CancelAuthorization",
        message: { authorizer: from, nonce },
        signature: sigOf(sig.v, sig.r, sig.s),
      });
    } catch {
      signer = undefined;
    }
    if (!signer || !same(signer, from)) throw new ChainError("AUTH_INVALID", "The cancellation is not signed by the buyer.");
    this.usedNonces.add(`${from.toLowerCase()}:${nonce}`);
    return { txHash: this.fakeTx(nonce) };
  }

  async onchainStatus(hash: Hex): Promise<OnchainStatus> {
    const p = this.payments.get(hash);
    return p ? { paid: true, refunded: 0n, payer: p.payer, txHash: p.txHash } : { paid: false, refunded: 0n };
  }

  async status(): Promise<ChainStatus> {
    return {
      mode: "mock",
      chainId: this.config.chainId,
      blockNumber: 0n,
      lagSeconds: 0,
      relayer: { address: "0x000000000000000000000000000000000000dEaD", wbtBalance: 1_000_000_000_000_000_000n },
    };
  }

  startScheduler(): void {
    // Not part of T11b. The due-date scheduler (T13) is a SHOULD feature.
  }
}
