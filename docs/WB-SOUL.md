# WB Soul findings (read-only, mainnet chain 1875, 2026-11-05)

WB Soul is WhiteBIT's KYC-backed, non-transferable identity on Whitechain. **Decision: mocked, clearly labelled badge, stretch only.** Do not wait for it on testnet.

## What exists
- Contracts live on **mainnet only** (searching the testnet explorer found nothing): SoulRegistry `0x0000000000000000000000000000000000002000`, SoulAttributeRegistry `...2002`, SoulBoundTokenRegistry `...2003`, SoulDrop `...1001`, IsVerified attribute `0xd88fa142B67F561C5f2Cbf803bF5AE906a8f1e41` ("Represents soul's current verification status on WhiteBIT", value 0 or 1).
- Readable by anyone: `isSoul(address)`, `soulOf(address)`, `soulAddresses(soulId)`, attribute value via the attribute registry.
- Controlled by one **ordinary wallet address (not a contract)**: owner `0xb358143eccbd5c529668f0c0e65527b3d56f0ed9` registers souls, assigns/revokes addresses and sets the verified flag.
- Scale: about 22,043 souls (highest sequential id found, assuming contiguous), 21,156 with the verified attribute set; sampled souls had one linked address each. This is tiny next to the "10M+ users" marketing.
- Old WB Soul docs pages (`/wb-soul/...`) return 404 now; behaviour was read from the contracts and WhiteBIT help articles.

## Booth answers (Whitechain team, 2026-11-05)
- Soul on Sepolia: unknown; do not wait. Mock the data and label it.
- `IsVerified` reflects **personal KYC**; **KYB is planned, no timeline.** The badge must not imply the business was verified.
- Registry owner key long-term: no answer yet (README open question).

## What we build
A `SoulStatus` adapter: `getStatus(address) -> { isSoul, verified, level }`. Mock implementation for the demo; a real read-only mainnet implementation behind a flag that is OFF in the demo.
Badge text, exactly: **"Individual KYC-verified on WhiteBIT (demo data, mocked)"**. Never write "verified business" or "WhiteBIT-verified merchant".

## Why it is not the main trust anchor
Mainnet only; one owner key can revoke anyone; proves "a KYC'd WhiteBIT user controls this address", not who the business is; reach is about 22K souls. The domain file stays the anchor. Base's comparable system is Coinbase Verifications (EAS attestations).
