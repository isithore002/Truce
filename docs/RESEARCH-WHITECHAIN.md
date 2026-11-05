# Whitechain research: what is distinctive, what is not, what is broken (2026-11-05)

Primary data: Whitechain docs (Markdown pages + `llms.txt`), Blockscout API and RPC calls, L2BEAT (now at ethbeat.org), DefiLlama, GitHub. Press as fallback. Reddit, Telegram and X could not be searched, so no community complaints were found; that is a gap, not evidence of none.

## Headline findings
1. **Mainnet is almost empty.** Live since 2026-10-26 (chain 1875). Explorer: 909,440 transactions vs 908,564 blocks, so about 876 transactions beyond one automatic system transaction per block (roughly 80 a day). The newest 50 transactions were all `setL1BlockValuesJovian` system transactions. The "transactions today" headline is mostly those (about 86,400 blocks a day).
2. **Security maturity is the weakest of the three compared.** L2BEAT: "Whitechain is not even a Stage 0 project", type "Other", "the proof system isn't fully functional".
3. **No official USDT on mainnet yet** (docs: USD₮ and ETH come in later releases after audit). Mainnet has USDC.e (3,037 holders). The track's USDT is testnet-only.

## Side by side (as of this date)
| | Whitechain | Base | Mantle |
|---|---|---|---|
| Gas token | WBT (exchange token) | ETH | MNT |
| L2BEAT stage | Not Stage 0, "Other" | Stage 1 | Stage 0, ZK rollup |
| Value secured | $475M | $14.7B | $1.25B |
| Daily user ops/sec (L2BEAT) | under 0.01 | 120 | 1.95 |
| DefiLlama TVL / stablecoins | not listed | $6.1B / $5.0B | $105M / $523M |
| L2 execution fee, 65k-gas token transfer (live gas prices) | about $0.024 (5.0 gwei, WBT $73.30) | about $0.0013 | about $0.0014 |
| Withdrawal to Ethereum | 7+ days canonical; Portal is centralized | not checked | not checked |
| Sequencer | one, run by the operator | one, Coinbase | centralized |
Whitechain's L2 execution fee is about 17 to 18 times higher; the L1 data fee is extra on all three. The 5 gwei floor means the USD cost rises one-for-one with WBT's price. The docs' fee examples assume $50 per WBT.

## Genuinely distinctive (and shared with others)
- Direct WBT withdrawal from the WhiteBIT UI to the chain with no bridge (docs claim). Coinbase and Bybit have comparable ties to Base and Mantle.
- In-place L1 to L2 migration: the legacy state became the L2 genesis (balances, contracts, addresses preserved; genesis block 50,961,390) with published reconciliation tooling. Other chains launched fresh; not checked whether other chains migrated in place.
- WB Soul (KYC-backed identity) and SoulDrop (fee rewards to WBT holders). Base has a comparable Coinbase Verifications system.
- Hryvnia stablecoin route (UAHe on the Portal; a test eUAH token on mainnet). Backing claims are WhiteBIT's own marketing.
- Agent-friendly docs: every page as Markdown, `llms.txt`, installable agent skills. Builders Program: up to $300K per team in tranches.
## Not wow factors
Low fees (it is more expensive than Base/Mantle); "10M+ users" (the site says 10M+ WhiteBIT and 40M+ W Group; other sources say about 5.5M and 30 to 35M; nothing shows on-chain); the promised native DEX and oracle (not in the docs; a third-party DEX, YetiTrade, exists on testnet).

## Issues and open queries
- **Security/decentralization:** one sequencer with no uptime guarantee; permissioned fault-proof challenger; a Guardian that can pause withdrawals; L2BEAT says node software is "under review"; soft confirmation is only the sequencer's word; Flashblocks not enabled; force inclusion via L1 within about 12 hours.
- **Assets/bridging:** native WBT cannot use the canonical bridge; the Portal is centralized with daily caps (testnet: 10,000 USDC, 200 WBT) and can reject transfers when liquidity is short; two USDTs on Sepolia (track `0xcedf…55a7` vs Portal's USDT.e `0xaa79…8f46`).
- **Developer/user friction:** no mainnet faucet (WBT must be bought on WhiteBIT with KYC); no documented ERC-4337/paymaster; legacy L1 and L2 share chain id 1875; explorer fee display omits the L1 data fee; the track USDT proxy is unverified so transfers decode under an odd name; docs and sources disagree (no third-party RPC vs Ankr works; faucet 0.5 vs 2 WBT).
- **Legal/geopolitical:** some outlets report Russia flagged WhiteBIT as "undesirable"; the docs state heavy disclaimers separating Whitechain from WhiteBIT; the Builders Program excludes sanctioned jurisdictions.
- **Maturity:** about 5 open GitHub issues, all housekeeping, few stars; status page showed no incidents in the last 7 days. The chain is ten days old, so some issues are newness.

## Why this matters for us
Whitechain needs real merchant flows, which is a legitimate pitch. Build token-agnostic (any EIP-3009 token), testnet only for the hackathon, and do not promise Whitechain-delivered users.

## Sources
Whitechain docs: https://docs.whitechain.io/learn/network/mainnet.md, `.../transaction-finality.md`, `.../network-fees.md`, `.../learn/general/faq.md`, `.../build/bridge/portal-bridge.md`, `.../build/ecosystem/for-partners.md` · https://whitechain.io · https://explorer.whitechain.io/api/v2/stats · https://status.whitechain.io · L2BEAT/ethbeat: https://ethbeat.org/layer2s/projects/whitechain (and /base, /mantle) · DefiLlama: https://api.llama.fi/v2/chains · https://stablecoins.llama.fi/stablecoinchains · GitHub: https://github.com/whitechain-labs · Optimism custom gas token: https://docs.optimism.io/op-stack/features/custom-gas-token
