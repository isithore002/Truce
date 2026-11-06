import type { CheckId } from './api/types';

/**
 * What a merchant should change when the buyer's check would FAIL. The first reason that applies is the root cause: when the
 * domain file cannot be read, the checks that compare against it cannot run, so only that one hint is given.
 * Returns an empty list when nothing failed.
 */
export function merchantHints(checks: { id: CheckId; ok: boolean }[], domain: string): string[] {
  const failed = new Set(checks.filter((c) => !c.ok).map((c) => c.id));
  if (failed.size === 0) return [];

  if (failed.has('domain_file_reachable')) {
    return [
      `Publish your wallet list at https://${domain}/.well-known/truce.json (Setup, step 3 generates the file), or check that the domain is spelled correctly. Until the buyer's check can read it, it shows FAIL.`,
    ];
  }

  const hints: string[] = [];
  if (failed.has('signature_valid')) hints.push('The signature does not match the invoice. Create the invoice again.');
  if (failed.has('merchant_matches_domain_file')) {
    hints.push(`The file on ${domain} lists a different signing wallet than the one you signed with. Sign with the listed wallet, or update the file.`);
  }
  if (failed.has('payout_in_domain_file')) {
    hints.push(`The payout wallet is not listed in the file on ${domain}. Add it to the payout list in the file, or use a payout wallet that is listed.`);
  }
  if (failed.has('chain_and_token_allowed')) {
    hints.push(`Check that the file on ${domain} lists chain 1874 and that the invoice uses the track USDT.`);
  }
  if (failed.has('not_expired')) hints.push('This invoice has already expired. Create a new one with a later due date or a longer payable window.');
  if (hints.length === 0) hints.push('See the failing checks above for what to change.');
  return hints;
}
