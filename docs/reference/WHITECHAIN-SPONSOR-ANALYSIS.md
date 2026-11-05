> **Reference copy, partly superseded.** Earlier sponsor analysis of Whitechain (2026-11-05, before we read the docs directly). Its "mainnet contradiction" is resolved: docs say live since 2026-10-26 (chain 1875). Its "no Whitechain history" finding still stands. See `COMPETITORS.md` and `RESEARCH-WHITECHAIN.md` for newer work.

# 2. Whitechain, pool $15,000

## Takeaway
Whitechain is a WhiteBIT-operated chain migrating to an OP Stack L2 whose Mumbai ask is narrow and unusually specific: real USDT stablecoin payments on chain 1874, in merchant, RWA and invisible-payment flows, with honest docs feedback. I found no Whitechain hackathon history at all; the prior-art map is empty, which is not the same as an open niche.

## Cited Findings

### A. STATED asks
- Four tracks: Operate: Stablecoin Payments for Business $5,000 ($2,500/$1,500/$1,000); Tokenize: Real World Finance $4,000 ($2,500/$1,500); Scale: Payments Nobody Notices $3,000 ($2,000/$1,000); Continuity: Bring Your Product to Whitechain $3,000. — [V] [Whitechain prizes](https://ethglobal.com/events/mumbai/prizes/whitechain); [L] 01d-whitechain-tracks.md (which lacked the Continuity track)
- Operate: drop-in piece a separate demo app adds in ~20 lines; both merchant and customer views; extra credit for refunds, renewals, accountant export. Won't place: plain-transfer pay button, tipping jars, bill splitters, custodial bridges into local-currency token, standalone payroll/escrow/revenue splits. Tokenize: rules enforced in contract (allowlists, transfer restrictions, maturity/settlement), at least one full lifecycle step, issuer/investor view; won't place mint buttons or ownership NFTs. Scale: payer sees zero crypto steps; must explain how business pays gas, how the relayer gets WBT and what prevents draining; won't place payer-signs-gas flows or AI chats that never pay. Continuity: existing product with users, proof of starting point (dated commit), "before and during" README section, real users/business count in favour, UI refresh alone not enough. Boundary: paying an invoice = Operate; financing/selling an invoice = Tokenize. — [V] same page
- Shared requirements: contracts on Whitechain Sepolia (1874) verified on explorer; at least one payment in the specified USDT (0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7; self-minted test token does not count); README line on why the flow needs onchain stablecoin settlement vs a regular rail; public repo with steady commits, README (setup, architecture, limitations); 2-4 min demo showing each party; WHITECHAIN_FEEDBACK.md (worked / stuck / docs lacked). No formal judging text. Mainnet "arriving in November". — [V] same page
- Hidden requirements: (1) USDT must be obtained, but the local chain notes say the token's `mint` appears owner-only and "how to get test USDT is unknown" ([L] 01d, UNVERIFIED) - a blocking dependency to resolve at the Whitechain workshop; (2) docs show a different "USDT.e" token (0xaa79...8f46) - use the track one ([L] 01d); (3) docs list no ERC-4337/paymaster/x402/permit-3009/embedded-wallet SDK ([L] 01d), but the USDT implementation has EIP-3009 and permit (verified from ABI [L]), which is why Scale suggests a self-run relayer; (4) the "steady commit history" rule penalises last-day dumps; (5) feedback file is mandatory, so Whitechain actively harvests docs gaps - it is the clearest statement of what the sponsor needs.
- Contradiction: mainnet. Track text says "arriving in November"; local notes say docs FAQ states live since 26 Oct 2026 ([L] 01d, unresolved); press says "targeting later in 2026" ([S] [The Defiant](https://thedefiant.io/news/markets/wbts-new-high-comes-as-whitechain-prepares-its-ethereum-layer-2-transition)); migration docs say state already migrated ([SN] l2docs.whitechain.io, host not resolvable from my fetch tool, so not read).

### B. REVEALED preference
- No Whitechain winners found anywhere. Search "Whitechain hackathon winners" returned nothing relevant ([SN]). Whitechain does not appear in any of ten local ETHGlobal prize pages (grep) nor in any project name/tagline/summary across 12 local event files ([L], zero hits). Mumbai appears to be its first ETHGlobal sponsorship that I can see. Whitechain's own earlier hackathons were not found; I cannot say none exist.
- Only revealed preference is the "won't place" list in the track text, which encodes lessons about common hackathon outputs (pay buttons, tipping, splitters) - probably from the sponsor/ETHGlobal's view of typical entries [H].

### C. STRATEGIC need
- Whitechain is an OP Stack L2 ("The Onchain Economy Layer") built with Optimism, gas token WBT, WhiteBIT-run single sequencer at launch (decentralised sequencing a stated goal), moving from a standalone L1; planned core building blocks: native DEX, oracle, bridge; WhiteBIT users to withdraw WBT directly to L2 after mainnet; WhiteBIT funds buybacks/burns (33% of trading-fee income). — [S] [The Defiant](https://thedefiant.io/news/markets/wbts-new-high-comes-as-whitechain-prepares-its-ethereum-layer-2-transition); [SN] Decrypt "Whitechain Relaunches as W Group's Distribution-First Ethereum Layer 2" (403 on fetch, headline only), Coin Edition, l2docs.whitechain.io snippets; [L] 01d for chain facts (1s blocks, Blockscout explorer, faucet limits).
- Inference: the tracks target merchant/stablecoin settlement because Whitechain's differentiator is distribution via the WhiteBIT exchange user base; it needs payment apps and RWA templates that give USDT actual use on the chain and gas abstraction because WBT is an exchange token newcomers will not hold. I found no Whitechain stablecoin-payments roadmap in any source [SN]; this reading comes from the track text itself. [H]
- Useful things builders could produce: docs gaps in the feedback file (no 4337/paymaster/x402 docs, two USDT addresses, how to obtain test USDT, EIP-712 domain version unverified), merchant SDKs, relayer templates. Evidence: [L] 01d.

### D. PATTERN MAP
No prior sponsor-specific projects exist to classify, so the classification below is of the pattern space from the stated list, not of prior Whitechain work. Confidence: low; it rests on the absence of history.
| Family | Prior Whitechain examples | Class |
|---|---|---|
| Merchant checkout/payment links/subscriptions/refunds | none found | Unclaimed (unobserved); but crowded elsewhere (Arc, Hedera, Base commerce) so "no history" is not evidence of weak competition from Mumbai entrants |
| Tokenized bonds/invoice financing/DvP/trade finance | none found | Unclaimed (unobserved); Hedera Tokenize at the same event is a direct competing track [L] 01c |
| Gasless/relayer/permit-3009 payments, agent x402 | none found | Unclaimed (unobserved); Hedera x402 and Arc nanopayments are same-event comparators |
| Continuity (existing products to Whitechain) | none found | Unobserved |
Three example projects for Whitechain: none exist that I could find. Closest comparators on other sponsors: Karwan (USDC trade finance, Arc), Thurman Protocol (loan DvP, Arc/CRE), Access0x1 (gas-free business payments, Arc) from [L] local data (these are Arc-mentioning, not Whitechain).

Whitespace themes (hypotheses):
1. A genuinely reusable payment primitive aligned to the "20 lines" test (Operate); evidence: explicit demand in track text, no precedent.
2. Contract-enforced RWA lifecycles with USDT coupons (Tokenize); evidence: track text; competing Hedera track.
3. Relayer + abuse-control design for gasless USDT (Scale) - the track explicitly asks "what stops draining it"; most hackathon relayers ignore that.
4. Working with EIP-3009/permit already present in the USDT implementation; evidence: [L] ABI.
5. Docs/tooling contributions captured via WHITECHAIN_FEEDBACK.md; evidence: required file.
6. Continuity: bringing an existing product with real users; evidence: track says real users count in favour; risk: pre-hackathon work rules.

## Inferences
- Because there is no revealed history, the "won't place" list and mandatory feedback file are the strongest signals; the winner is likely the team that passes every hard requirement cleanly, since many entrants fail on real USDT/explorer links.
- Test-USDT access and unclear mainnet status are execution risks, not just research gaps.

## Gaps
- Whitechain own hackathons, past ETHGlobal winners (none found); roadmap beyond DEX/oracle/bridge; official docs (docs.whitechain.io, l2docs.whitechain.io) not fetchable from my environment (l2docs host did not resolve); Decrypt article blocked (403); how to get test USDT; mainnet status.

