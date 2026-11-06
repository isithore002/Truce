/** Plain-language text and rules for pay-on-due-date. Pure, so it is easy to test. */
export function healthText(reason?: string): string {
  switch (reason) {
    case undefined:
    case "NONE":
      return "Looks fine right now. This is a snapshot, not a lock.";
    case "LOW_BALANCE":
      return "The buyer's balance is below the invoice amount.";
    case "AUTH_CANCELLED":
      return "The payment authorization was cancelled or already used.";
    case "AUTH_EXPIRING":
      return "The payment authorization expires within an hour.";
    case "BLOCKED":
      return "The buyer's wallet is blocked by the token.";
    case "WINDOW_ENDED":
      return "The payment window ended before the money could be collected.";
    case "WRONG_PAYER":
      return "This wallet is not the payer the invoice allows.";
    case "AUTH_INVALID":
      return "The payment authorization is no longer valid.";
    default:
      return `The payment could not be collected (${reason}).`;
  }
}

/** Pay-on-due-date needs a due date that has not started yet. */
export function canScheduleDue(dueDate: bigint | string, nowSec: number): boolean {
  const due = BigInt(dueDate);
  return due > 0n && due > BigInt(nowSec);
}

/** "in 2 minutes", "in 3 days", or "now" for a time that has already begun. */
export function untilText(targetSec: number, nowSec: number): string {
  const s = targetSec - nowSec;
  if (s <= 0) return "now";
  if (s < 90) return `in ${s} second${s === 1 ? "" : "s"}`;
  if (s < 5400) return `in ${Math.round(s / 60)} minutes`;
  if (s < 129_600) return `in ${Math.round(s / 3600)} hours`;
  return `in ${Math.round(s / 86_400)} days`;
}
