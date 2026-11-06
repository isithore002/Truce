/**
 * MOCKED WB Soul status. Real Soul registries exist only on Whitechain mainnet, and we make no mainnet calls.
 * This adapter returns fixed demo data for the fictional example merchant and nothing for anyone else.
 * IsVerified reflects personal KYC of an individual, not a business, so the badge text says exactly that.
 */
export interface SoulStatus {
  isSoul: boolean;
  verified: boolean;
}

export const SOUL_BADGE_TEXT = "Individual KYC-verified on WhiteBIT (demo data, mocked)";

const MOCK_VERIFIED = new Set(["0x19d47570ba52e058bd6432009b2705f799b851dc"]); // the example merchant's wallet

/** Returns demo data only in example mode; outside it there is no Soul information at all. */
export function getSoulStatus(address: string, exampleMode: boolean): SoulStatus | undefined {
  if (!exampleMode) return undefined;
  const verified = MOCK_VERIFIED.has(address.toLowerCase());
  return { isSoul: verified, verified };
}
