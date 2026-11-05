import { BaseError, ContractFunctionRevertedError, encodeErrorResult, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { ChainError, mapChainError } from "../src/chain/errors.js";
import { RateLimiter, RelayerBudget } from "../src/chain/limits.js";

const settlerErrors = parseAbi(["error BadMerchantSignature()", "error AlreadyPaid()", "error InvoiceExpired()", "error WrongPayer()", "error TokenNotAllowed()"]);

function reverted(abi: Parameters<typeof encodeErrorResult>[0]["abi"], errorName: string, args?: unknown[]) {
  const data = encodeErrorResult({ abi, errorName, args } as never);
  return new ContractFunctionRevertedError({ abi: abi as never, data, functionName: "settle" });
}

describe("mapChainError", () => {
  it("maps InvoiceSettler custom errors to API codes", () => {
    const cases: [string, string][] = [
      ["BadMerchantSignature", "SIGNATURE_INVALID"],
      ["AlreadyPaid", "ALREADY_PAID"],
      ["InvoiceExpired", "EXPIRED"],
      ["WrongPayer", "WRONG_PAYER"],
      ["TokenNotAllowed", "TOKEN_NOT_ALLOWED"],
    ];
    for (const [name, code] of cases) {
      const mapped = mapChainError(reverted(settlerErrors, name));
      expect(mapped.code).toBe(code);
      expect(mapped.details).toEqual({ contractError: name });
    }
  });

  it("maps token revert strings", () => {
    const err = (reason: string) => reverted([{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }], "Error", [reason]);
    expect(mapChainError(err("authorization is expired")).code).toBe("AUTH_INVALID");
    expect(mapChainError(err("authorization is used")).code).toBe("AUTH_INVALID");
    expect(mapChainError(err("invalid signature")).code).toBe("AUTH_INVALID");
    expect(mapChainError(err("transfer amount exceeds balance")).code).toBe("INSUFFICIENT_BALANCE");
    expect(mapChainError(err("something unexpected")).code).toBe("SIMULATION_FAILED");
  });

  it("never blames the buyer for infrastructure errors (e.g. the relayer is out of gas money)", () => {
    const e = mapChainError(new BaseError("The total cost (gas * gas fee + value) exceeds the balance of the account."));
    expect(e.code).toBe("INTERNAL");
    expect(mapChainError(new Error("ECONNREFUSED http://rpc.example/?key=secret")).message).not.toMatch(/secret|rpc\.example/);
  });

  it("passes ChainError through unchanged", () => {
    const e = new ChainError("RATE_LIMITED", "slow down");
    expect(mapChainError(e)).toBe(e);
  });
});

describe("RelayerBudget", () => {
  it("allows spending up to the cap and then refuses", () => {
    const b = new RelayerBudget(100n, () => 0);
    b.reserve(60n).commit(60n);
    b.reserve(40n).commit(40n);
    expect(() => b.reserve(1n)).toThrowError(expect.objectContaining({ code: "RELAYER_BUDGET_EXHAUSTED" }));
  });

  it("corrects the reservation to the actual cost, and release frees it", () => {
    const b = new RelayerBudget(100n, () => 0);
    const r = b.reserve(90n);
    r.commit(30n);
    expect(b.spentWei()).toBe(30n);
    b.reserve(70n).release();
    expect(b.spentWei()).toBe(30n);
  });

  it("forgets spend older than 24 hours", () => {
    let t = 0;
    const b = new RelayerBudget(100n, () => t);
    b.reserve(100n).commit(100n);
    expect(() => b.reserve(1n)).toThrow();
    t += 24 * 60 * 60 * 1000 + 1;
    expect(() => b.reserve(100n)).not.toThrow();
  });
});

describe("RateLimiter", () => {
  it("limits per key within the window, and recovers after it", () => {
    let t = 0;
    const rl = new RateLimiter(2, 1000, () => t);
    rl.check("1.2.3.4");
    rl.check("1.2.3.4");
    expect(() => rl.check("1.2.3.4")).toThrowError(expect.objectContaining({ code: "RATE_LIMITED" }));
    rl.check("5.6.7.8"); // another caller is unaffected
    t += 1001;
    expect(() => rl.check("1.2.3.4")).not.toThrow();
  });

  it("does not limit calls without a key", () => {
    const rl = new RateLimiter(1, 1000);
    for (let i = 0; i < 5; i++) rl.check(undefined);
  });
});
