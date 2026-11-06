import { parseDomainFile } from "@truce/invoice-lib";
import type { Address } from "viem";
import type { FetchResult } from "../domain/fetchDomainFile.js";

export type DomainCheckStatus = "OK" | "UNREACHABLE" | "INVALID_FILE" | "SIGNER_MISMATCH" | "PAYOUT_NOT_LISTED" | "CHAIN_NOT_LISTED";

export interface DomainCheck {
  status: DomainCheckStatus;
  domain: string;
  /** Plain-language result for the merchant. */
  message: string;
  /** True when the file came from this server's fictional example list, not from the internet. */
  demo: boolean;
  listed?: { signingAddress: Address; payoutAddresses: Address[] };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Compares the file a domain publishes with the wallets the merchant is about to use. It applies the same rules
 * as the buyer's check (signing wallet, payout wallet, network), so "OK" here means the buyer's three
 * domain checks will pass for an invoice signed by `signer` and paid to `payout`.
 */
export function evaluateDomainFile(fetched: FetchResult, input: { domain: string; signer: Address; payout: Address; chainId: number }): DomainCheck {
  const { domain, signer, payout, chainId } = input;
  const demo = domain.endsWith(".example");
  const where = demo ? `the example list on this server for ${domain}` : `https://${domain}/.well-known/truce.json`;

  if (!fetched.ok) {
    return {
      status: "UNREACHABLE",
      domain,
      demo,
      message: `Could not read ${where}: ${fetched.reason}. Buyers would see FAIL. The file must open over https at exactly that address, with no redirect, and contain valid JSON.`,
    };
  }
  const parsed = parseDomainFile(fetched.value);
  if (!parsed.ok) {
    return { status: "INVALID_FILE", domain, demo, message: `Found ${where}, but it is not a valid Truce domain file (${parsed.error}). Download a fresh truce.json from this page and publish that.` };
  }
  const file = parsed.value;
  const listed = { signingAddress: file.signingAddress, payoutAddresses: file.payoutAddresses };
  if (!same(file.signingAddress, signer)) {
    return {
      status: "SIGNER_MISMATCH",
      domain,
      demo,
      listed,
      message: `Found ${where}, but it lists a different signing wallet (${short(file.signingAddress)}) than the wallet you connected (${short(signer)}). Publish the file shown above, or connect the listed wallet.`,
    };
  }
  if (!file.payoutAddresses.some((a) => same(a, payout))) {
    return {
      status: "PAYOUT_NOT_LISTED",
      domain,
      demo,
      listed,
      message: `Found ${where}, but your payout wallet ${short(payout)} is not in its list of payout wallets. Publish the file shown above.`,
    };
  }
  if (!file.chainIds.includes(chainId)) {
    return { status: "CHAIN_NOT_LISTED", domain, demo, listed, message: `Found ${where}, but it does not list this network (chain ${chainId}). Publish the file shown above.` };
  }
  return {
    status: "OK",
    domain,
    demo,
    listed,
    message: demo
      ? `Found in ${where}. It lists your signing wallet and payout wallet. This is a fictional demo domain, not a website, so the same step on a real domain means publishing the file.`
      : `Found ${where}. It lists your signing wallet and payout wallet, so buyers will see PASS on invoices you sign with it.`,
  };
}
