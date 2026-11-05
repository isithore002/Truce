import { BaseError, ContractFunctionRevertedError } from "viem";

/** API error codes (docs/design/C-TECHNICAL.md section 3) that the chain module can raise. */
export type ChainErrorCode =
  | "INVALID_DOCUMENT"
  | "SIGNATURE_INVALID"
  | "TOKEN_NOT_ALLOWED"
  | "EXPIRED"
  | "AUTH_INVALID"
  | "WRONG_PAYER"
  | "SIMULATION_FAILED"
  | "INSUFFICIENT_BALANCE"
  | "ALREADY_PAID"
  | "RELAYER_BUDGET_EXHAUSTED"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  /** The transaction was sent but not confirmed in time; `details.txHash` says which. */
  | "PENDING"
  | "INTERNAL";

export class ChainError extends Error {
  constructor(
    readonly code: ChainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

/** InvoiceSettler custom errors to API codes and friendly messages. */
const CONTRACT_ERRORS: Record<string, [ChainErrorCode, string]> = {
  BadMerchantSignature: ["SIGNATURE_INVALID", "The merchant's signature does not match this invoice. Do not pay it."],
  AlreadyPaid: ["ALREADY_PAID", "This invoice has already been paid."],
  InvoiceExpired: ["EXPIRED", "This invoice has expired."],
  WrongPayer: ["WRONG_PAYER", "This invoice can only be paid by a different wallet."],
  TokenNotAllowed: ["TOKEN_NOT_ALLOWED", "The payment contract does not accept this token."],
  InvalidInvoice: ["INVALID_DOCUMENT", "The invoice has an invalid amount or payout."],
  UnexpectedBalanceChange: ["SIMULATION_FAILED", "The token did not deliver the exact amount, so the payment was refused."],
  EnforcedPause: ["SIMULATION_FAILED", "Payments are paused."],
  ERC20InsufficientBalance: ["INSUFFICIENT_BALANCE", "The buyer's balance is too low to pay this invoice."],
};

/** Token revert strings (the track USDT, and common EIP-3009 implementations) to API codes. */
function fromReason(reason: string): [ChainErrorCode, string] {
  const r = reason.toLowerCase();
  if (/balance|insufficient/.test(r)) return ["INSUFFICIENT_BALANCE", "The buyer's balance is too low to pay this invoice."];
  if (/authorization.*(used|expired|not yet valid)|invalid signature|nonce|caller must be the payee/.test(r)) {
    return ["AUTH_INVALID", "The buyer's payment authorization is not valid right now (expired, not yet valid, already used or wrongly signed)."];
  }
  return ["SIMULATION_FAILED", "The payment would fail on chain, so nothing was sent."];
}

/** Maps anything thrown while simulating or sending into a ChainError. Never leaks RPC URLs or keys. */
export function mapChainError(e: unknown): ChainError {
  if (e instanceof ChainError) return e;
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && CONTRACT_ERRORS[name]) {
        const [code, message] = CONTRACT_ERRORS[name];
        return new ChainError(code, message, { contractError: name });
      }
      const [code, message] = fromReason(reverted.reason ?? reverted.shortMessage ?? "");
      return new ChainError(code, message, name ? { contractError: name } : undefined);
    }
    // Not a contract revert: RPC down, relayer out of gas money, bad config... never blame the buyer.
    return new ChainError("INTERNAL", "The chain could not be reached or returned an unexpected error.");
  }
  return new ChainError("INTERNAL", "Unexpected error.");
}
