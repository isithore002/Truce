import { type Address, type Hex } from "viem";
import { parseDomainFile, parseInvoiceDoc, type DomainFile, type InvoiceDoc } from "./doc.js";
import { domainHash, invoiceHash } from "./hash.js";
import { memoHash } from "./memo.js";
import { recoverMerchant } from "./sign.js";

/** Check ids, in display order (docs/design/C-TECHNICAL.md section 3). All must pass for PASS. */
export const CHECK_IDS = [
  "document_valid",
  "signature_valid",
  "domain_file_reachable",
  "merchant_matches_domain_file",
  "payout_in_domain_file",
  "domain_hash_matches",
  "chain_and_token_allowed",
  "not_expired",
  "memo_hash_matches_details",
  "payer_ok",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export interface Check {
  id: CheckId;
  ok: boolean;
  /** Plain language, safe to show to a buyer. */
  message: string;
}

/**
 * Fetches the merchant's /.well-known/truce.json for a domain and returns the parsed JSON.
 * Injected so this library does no network I/O (the server supplies an SSRF-guarded fetch).
 * Return null or throw when the file cannot be fetched.
 */
export type DomainResolver = (domain: string) => Promise<unknown | null>;

export interface VerifyContext {
  chainId: number;
  /** The InvoiceSettler the invoice was signed for. */
  settler: Address;
  /** Tokens the settler accepts. */
  allowedTokens: Address[];
  /** Unix seconds. */
  now: bigint;
  resolveDomain: DomainResolver;
  /** The connected buyer wallet, when known. Only used for the payer-lock check. */
  buyer?: Address;
}

export interface VerifyResult {
  result: "PASS" | "FAIL";
  checks: Check[];
  /** The invoice digest the merchant signed. Absent when the document is invalid. */
  invoiceHash?: Hex;
  recoveredSigner?: Address;
  /** The parsed domain file, when it was reachable and valid. */
  domainFile?: DomainFile;
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Runs all ten checks against an untrusted document. Never throws; every check always reports. */
export async function verifyInvoiceDoc(raw: unknown, ctx: VerifyContext): Promise<VerifyResult> {
  const parsed = parseInvoiceDoc(raw);
  if (!parsed.ok) {
    const checks: Check[] = CHECK_IDS.map((id) =>
      id === "document_valid"
        ? { id, ok: false, message: `This invoice is not valid: ${parsed.error}.` }
        : { id, ok: false, message: "Not checked, because the invoice document is not valid." },
    );
    return { result: "FAIL", checks };
  }
  const doc: InvoiceDoc = parsed.value;
  const inv = doc.invoice;
  const results = new Map<CheckId, Check>();
  const set = (id: CheckId, ok: boolean, message: string) => results.set(id, { id, ok, message });

  set("document_valid", true, "The invoice document is well formed.");

  // Signature: the merchant wallet named in the invoice signed exactly these fields.
  const signatureCtx = { chainId: ctx.chainId, verifyingContract: ctx.settler };
  const hash = invoiceHash(inv, signatureCtx);
  let recovered: Address | undefined;
  try {
    recovered = await recoverMerchant(inv, doc.signature, signatureCtx);
  } catch {
    recovered = undefined;
  }
  if (recovered && same(recovered, inv.merchant)) {
    set("signature_valid", true, `Signed by ${short(inv.merchant)}, and nothing was changed after signing.`);
  } else {
    set(
      "signature_valid",
      false,
      "The signature does not match this invoice. A field (the amount or the payout wallet, for example) was changed after the merchant signed it, or it was signed by a different wallet.",
    );
  }

  // Domain file: the merchant's own website names the wallets that may sign and be paid.
  let file: DomainFile | undefined;
  let fileProblem = "";
  try {
    const rawFile = await ctx.resolveDomain(doc.domain);
    if (rawFile === null || rawFile === undefined) {
      fileProblem = `Could not fetch https://${doc.domain}/.well-known/truce.json.`;
    } else {
      const pf = parseDomainFile(rawFile);
      if (pf.ok) file = pf.value;
      else fileProblem = `The file at ${doc.domain} is not a valid Truce domain file (${pf.error}).`;
    }
  } catch {
    fileProblem = `Could not fetch https://${doc.domain}/.well-known/truce.json.`;
  }

  if (file) {
    set("domain_file_reachable", true, `Found the merchant's published wallet list at ${doc.domain}.`);
    set(
      "merchant_matches_domain_file",
      same(file.signingAddress, inv.merchant),
      same(file.signingAddress, inv.merchant)
        ? `The signing wallet is the one ${doc.domain} publishes.`
        : `${doc.domain} publishes a different signing wallet (${short(file.signingAddress)}) than the one that signed this invoice (${short(inv.merchant)}).`,
    );
    const listed = file.payoutAddresses.some((a) => same(a, inv.payout));
    set(
      "payout_in_domain_file",
      listed,
      listed
        ? `The payout wallet ${short(inv.payout)} is listed by ${doc.domain}.`
        : `The payout wallet ${short(inv.payout)} is NOT one of the wallets ${doc.domain} publishes. Do not pay this invoice.`,
    );
  } else {
    set("domain_file_reachable", false, `${fileProblem} The payee cannot be confirmed.`);
    set("merchant_matches_domain_file", false, "Not checked, because the merchant's domain file is unavailable.");
    set("payout_in_domain_file", false, "Not checked, because the merchant's domain file is unavailable.");
  }

  const expectedDomainHash = domainHash(doc.domain);
  set(
    "domain_hash_matches",
    expectedDomainHash === inv.domainHash.toLowerCase(),
    expectedDomainHash === inv.domainHash.toLowerCase()
      ? `The invoice is bound to ${doc.domain}.`
      : `The invoice was not signed for ${doc.domain}.`,
  );

  const tokenOk = ctx.allowedTokens.some((t) => same(t, inv.token));
  const chainOk = file ? file.chainIds.includes(ctx.chainId) : true;
  set(
    "chain_and_token_allowed",
    tokenOk && chainOk,
    !tokenOk
      ? "This invoice asks for a token the payment contract does not accept."
      : !chainOk
        ? `${doc.domain} does not list this network (chain ${ctx.chainId}).`
        : `Payable in an accepted token on chain ${ctx.chainId}.`,
  );

  set(
    "not_expired",
    ctx.now <= inv.expiry,
    ctx.now <= inv.expiry ? "The invoice has not expired." : "This invoice has expired and can no longer be paid.",
  );

  const memoOk = memoHash(doc.details) === inv.memoHash.toLowerCase();
  set(
    "memo_hash_matches_details",
    memoOk,
    memoOk ? "The line items and notes are exactly what the merchant signed." : "The line items or notes were changed after the merchant signed.",
  );

  if (same(inv.payer, ZERO)) {
    set("payer_ok", true, "Anyone may pay this invoice.");
  } else if (!ctx.buyer) {
    set("payer_ok", true, `This invoice can only be paid by ${short(inv.payer)}. Connect that wallet to pay.`);
  } else if (same(ctx.buyer, inv.payer)) {
    set("payer_ok", true, "This invoice is locked to your wallet.");
  } else {
    set("payer_ok", false, `This invoice can only be paid by ${short(inv.payer)}, not by the connected wallet.`);
  }

  const checks = CHECK_IDS.map((id) => results.get(id) as Check);
  return {
    result: checks.every((c) => c.ok) ? "PASS" : "FAIL",
    checks,
    invoiceHash: hash,
    recoveredSigner: recovered,
    domainFile: file,
  };
}
