> **Reference copy, partly superseded.** Track text and hard requirements below are still the source of truth. Items marked UNVERIFIED here were resolved later (see `WHITECHAIN-FACTS.md`): the track USDT EIP-712 domain is name "Tether USD", version "1"; mainnet has been live since 2026-10-26; test USDT comes from swapping WBT on YetiTrade.

# 01d — Whitechain tracks (ETHGlobal Mumbai 2026): track text + verified chain facts

Source: text pasted by the user (3 tracks). Lines under "Added by me" are from a docs/explorer read on 2026-11-02 via subagents; items marked UNVERIFIED were not confirmed verbatim.

**About (sponsor text):** Whitechain = "The Onchain Economy Layer", EVM L2 on the OP Stack, built with Optimism. Mainnet "arriving in November" per the track text.
**Hard requirements, identical in all three tracks:**
1. Contracts deployed on **Whitechain Sepolia (chain ID 1874)** and **verified** on the Whitechain explorer.
2. At least one payment in **USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`** in the main flow, explorer link in README. A self-minted test token does **not** count.
3. README line: why this flow needs onchain stablecoin settlement on Whitechain, and what a regular rail couldn't do.
4. Public GitHub repo with steady commit history; README = setup, architecture, current limitations.
5. Demo video **2-4 min** showing **each party involved**.
6. `WHITECHAIN_FEEDBACK.md`: what worked, where stuck, what docs lacked.
Test tokens have no value. Prizes paid by ETHGlobal in USDC. Free Ankr RPC for hackers (1,500 req/s, 7 days).
Links: docs.whitechain.io · faucet.testnet.whitechain.io · explorer.testnet.whitechain.io · optimism.io · docs.optimism.io · ankr.com/rpc (referral Whitechain2026).

---
## 1. Operate: Stablecoin Payments for Business, $5,000 (1st $2,500 / 2nd $1,500 / 3rd $1,000)
**Ask:** everything a business needs to get paid in USDT, from first checkout to what happens after. A flow a real merchant could plug into an app or store, end to end.
**Ideas given:** drop-in checkout with order webhooks + onchain receipt · payment links/invoices (due dates, reminders) · subscriptions with permit-based pulls, cancel anytime · refunds and partial refunds in one click, customer-checkable record.
**Want to see:** a drop-in piece (widget / SDK / payment-link API / plugin) that a separate demo app adds in about **20 lines** · **both views** (merchant and paying customer) · extra credit for going past the first payment (refund, renewal, accountant export).
**Won't place:** pay button that sends a plain transfer · tipping jars · bill splitters · custodial bridges into a local-currency token · payroll, escrow, revenue splits on their own.

## 2. Tokenize: Real World Finance, $4,000 (1st $2,500 / 2nd $1,500)
**Ask:** model RWA lifecycles and compliance logic onchain; issuance, settlement or lifecycle flow where **every payment is in USDT**.
**Ideas given:** tokenized bonds/notes (investor allowlist, USDT coupons, repayment at maturity) · invoice financing (tokenize invoice, buyer funds at a discount, auto-settle on due date) · repo / short-term lending with delivery-versus-payment (asset and stablecoin move in one tx) · trade finance (importer, exporter, bank each confirm a step before release).
**Want to see:** transfer rules **enforced in the contract** (allowlists, transfer restrictions, maturity/settlement conditions), not a token with a UI on top · a clear issuer/investor/business user · at least one full lifecycle step from issuance to payment or settlement.
**Won't place:** mint button with no rules · ownership NFTs where nothing is enforced onchain.
**Boundary rule:** paying an invoice = Operate. Financing or selling an invoice = Tokenize.

## 3. Scale: Payments Nobody Notices, $3,000 (1st $2,000 / 2nd $1,000)
**Ask:** payer (person or AI agent) pays in stablecoins without holding WBT for gas, writing down a seed phrase, or knowing what chain they are on.
**Ideas given:** gasless checkout, merchant covers gas, permit or EIP-3009 + own relayer · embedded wallet / smart account from any provider supporting chain 1874 · pay-per-request APIs, agent pays in USDT over x402, facilitator you run.
**Want to see:** payer flow with **zero crypto steps visible** · how the business pays gas, how the relayer gets WBT, what stops draining it.
**Won't place:** payer still signs a tx that costs them gas · AI chats that never actually pay anyone.

---
## Added by me: chain facts (docs/explorer read 2026-11-02)
- Chain 1874 (0x752), L1 = Ethereum Sepolia, block time 1s, gas token **WBT** (18 dec, OP Stack custom gas token). RPC `https://rpc.testnet.whitechain.io` (50 req/s/IP, batch up to 100). Explorer is Blockscout (public API, no key). Faucet: GitHub login (account >= 30 days), 0.5 WBT / 24 h. Multicall3 predeployed. Mainnet = chain 1875 (docs FAQ says live since 26 Oct 2026; the track text says "arriving in November": unresolved contradiction).
- **USDT in the track** `0xcedfB5...5a7`: "Tether USD", 6 decimals, supply 1,945,270, EIP-1967 transparent proxy -> implementation `0x26425662D126412128967ECf0a02EC48573026F7` (`TetherTokenV2`, verified). Source (verbatim) shows `TetherTokenV2 is TetherToken, EIP3009` with `permit` and `transferWithAuthorization` / `receiveWithAuthorization`, each in a `(v,r,s)` and a `bytes signature` overload, all `onlyNotBlocked`.
- VERIFIED from the implementation ABI (Blockscout `getabi`, complete JSON): `transferWithAuthorization` / `receiveWithAuthorization` (both with `(v,r,s)` and `bytes signature` overloads), `cancelAuthorization` (also `v,r,s` and `bytes` overloads, so a cancel can be signed offchain and relayed), `authorizationState(authorizer, nonce)`, `permit` (both overloads), `nonces`, `DOMAIN_SEPARATOR()`, `name()`, `isBlocked(address)`. Absent: `version()`, `eip712Domain()`, `domainSeparator()`.
- ERC-1271 (contract-wallet signers): verbatim for `permit(bytes)` via `SignatureChecker.isValidSignatureNow`. For 3009 `bytes` overloads it is only from a model summary of `EIP3009.sol` (`_requireValidSignature` -> `SignatureChecker`): **test on-chain before relying on it**.
- UNVERIFIED: EIP-712 domain version (summary says "1"; read `DOMAIN_SEPARATOR()` and `name()` on-chain), `mint` is `onlyOwner` (no public faucet function seen: **how to get test USDT is unknown**).
- The docs token list shows a *different* USDT (`0xaa79...8f46`, "USDT.e", 6 dec). The track names `0xcedf...`; use that one.
- Docs mention no ERC-4337 / paymaster / x402 / permit-3009 and name no embedded-wallet SDK (wallets listed: MetaMask, Rabby, Reown AppKit, Safe).
