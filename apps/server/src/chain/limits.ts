import { ChainError } from "./errors.js";

/**
 * Daily cap on the WBT the relayer may spend on gas. Spend is reserved before sending (from a gas
 * estimate) and corrected to the real cost afterwards. The window is a rolling 24 hours.
 * Counts L2 execution gas, plus the L1 data fee when the receipt reports it.
 */
export class RelayerBudget {
  private entries: { at: number; wei: bigint }[] = [];

  constructor(
    private readonly capWei: bigint,
    private readonly now: () => number = Date.now,
    private readonly windowMs = 24 * 60 * 60 * 1000,
  ) {}

  private prune() {
    const cutoff = this.now() - this.windowMs;
    this.entries = this.entries.filter((e) => e.at > cutoff);
  }

  spentWei(): bigint {
    this.prune();
    return this.entries.reduce((sum, e) => sum + e.wei, 0n);
  }

  /** Throws RELAYER_BUDGET_EXHAUSTED if the estimate does not fit. Returns a handle to settle the spend. */
  reserve(estimateWei: bigint): { commit(actualWei: bigint): void; release(): void } {
    if (this.spentWei() + estimateWei > this.capWei) {
      throw new ChainError("RELAYER_BUDGET_EXHAUSTED", "The relayer has reached its daily gas budget. Try again later, or submit the payment yourself.");
    }
    const entry = { at: this.now(), wei: estimateWei };
    this.entries.push(entry);
    return {
      commit: (actualWei) => {
        entry.wei = actualWei;
      },
      release: () => {
        this.entries = this.entries.filter((e) => e !== entry);
      },
    };
  }
}

/** Sliding-window limiter keyed by caller (usually IP). Calls with no key are not limited. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string | undefined): void {
    if (!key) return;
    const cutoff = this.now() - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      throw new ChainError("RATE_LIMITED", "Too many payment attempts. Please wait a minute and try again.");
    }
    recent.push(this.now());
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.hits.clear(); // bound memory under abuse
  }
}
