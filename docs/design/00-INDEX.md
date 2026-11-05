# Truce: design package (planning artifacts only, no application code)

Written 2026-11-05 about 23:45 IST for a **solo** build with about 33 hours left. It refines, and where it differs overrides, `../SPEC.md` (scope) and `../INTERFACES.md` (types and API); differences are listed at the end of this page.

## Executive summary
1. **What:** Truce lets a merchant publish one small file on its own domain and issue signed invoices; the buyer's app verifies the payee before paying; one smart contract pays only the payout wallet the merchant signed.
2. **For whom:** finance and ops people at crypto-native companies (buyers) and the small agencies that bill them (merchants).
3. **Why it matters:** payee-swap invoice fraud (about $3.05B business email compromise reported to the FBI in 2025, secondary source) and wrong-address errors; none of the other entries we found verifies the merchant against its own domain.
4. **Track:** Whitechain **Operate** (invoices, refunds, a drop-in piece of about 20 lines, merchant and customer views, accountant export), at ETHGlobal Mumbai 2026.
5. **Core mechanism:** EIP-712 signed invoice, domain file `/.well-known/truce.json`, buyer-signed EIP-3009 `receiveWithAuthorization`, contract `InvoiceSettler`, relayer paying gas in WBT, USDT on Whitechain Sepolia (chain 1874).
6. **Stack:** Solidity 0.8.30 + Foundry; TypeScript on Node 22 (Fastify, viem, zod); React + Vite; JSON-file store.
7. **MVP cut line:** a script settles one real invoice (C1) -> browser pay and verify (C2) -> dashboard, CSV, SDK (C3) -> pinning (C4). Due-date mode, health checks, refunds are SHOULD and only start if on schedule.
8. **Demo hero:** a swapped payout wallet fails twice, in the app (PASS/FAIL) and on chain (revert).
9. **Honest limits:** funds are not locked, amounts and addresses are public, lookalike domains and sockpuppet fraud are not solved, testnet only, no real users.
10. **Biggest risks:** the signed-transfer gate, a 25-hour MUST budget with about 2.5 hours of slack, and rival entries; every one has a fallback (`D-BUILD-PLAN.md`).

## Assumptions (nothing here blocks the work; no blocking questions)
- A1 One developer on Windows with Git Bash; Foundry 1.5.1, Node 22, npm 10, git 2.47 are installed (verified).
- A2 Hackathon and demo run on **testnet only**; no mainnet transactions (they cost real WBT, per the booth).
- A3 There is no real merchant; the demo uses fictional "Northlight Design Studio" and "Beta Labs", labelled EXAMPLE DATA.
- A4 In the demo, merchant domains such as `northlight-design.example` are served from local fixtures; real HTTPS domain fetching is implemented and tested separately.
- A5 Buyers use EOA wallets (MetaMask or Rabby). Contract-wallet buyers are UNVERIFIED.
- A6 The merchant signer is an EOA in the demo; the contract also accepts ERC-1271 signers (not tested live).
- A7 One server process hosts API, relayer and scheduler. One relayer key, a throwaway funded from the faucet.
- A8 Demo token is the track USDT `0xcedfB5...55a7`; the contract's token allowlist is fixed at deploy.
- A9 Judges read the repo, README, video and explorer links; a live public URL is optional.
- A10 The Whitechain track text governs; ETHGlobal's finalist criteria apply for finalist judging.
- A11 Estimates assume an AI coding assistant is used. They are my estimates, not measured.

## Verification log
| Claim | Status | Source |
|---|---|---|
| Chain 1874, RPC, explorer, 1s blocks, 5 gwei base-fee floor | Verified | Whitechain docs, live RPC calls |
| Track USDT EIP-712 domain name "Tether USD", version "1" | Verified | Reconstructed locally and matched on-chain `DOMAIN_SEPARATOR` (`gate/`) |
| `receiveWithAuthorization`, `cancelAuthorization`, `authorizationState`, `permit`, `isBlocked` present | Verified | Token ABI on the explorer |
| Docs pin solc 0.8.30 and `evm_version = "prague"`; verification fails on a compiler mismatch | Verified | docs.whitechain.io deploy-with-foundry |
| Verify command: `forge verify-contract ... --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` | Verified in docs; **not yet run by us** | same page |
| viem ships `whitechainSepolia` (id 1874) and `whitechain` | Verified | installed viem 2.57.16 |
| Wallets documented: MetaMask, Rabby, Reown; Safe for multisig | Verified | docs wallets page |
| Signed `cancelAuthorization` works on the track USDT | **UNVERIFIED** | `gate1.mjs --cancel` tests it |
| Buyer ERC-1271 signatures accepted by the token | **UNVERIFIED** | not tested |
| Gas per `settle` (estimate 120k to 200k, about 0.0006 to 0.001 WBT before L1 fee) | **UNVERIFIED** | estimate |
| Faucet drip (docs 0.5 WBT per 24h vs flyer 2 WBT per day) | **UNVERIFIED** | open |
| Free hosting tiers (Render, Vercel, Fly) | **UNVERIFIED** | not checked |
| Mermaid diagrams render without errors | **UNVERIFIED** | reviewed by hand only; parser not installed (low disk space on C:) |
| Foundry on native Windows (docs say WSL is required) | Works here (forge 1.5.1 in Git Bash) | feedback item |

## Contents
- [A. Product definition](A-PRODUCT.md)
- [B. Diagrams (Mermaid)](B-DIAGRAMS.md)
- [C. Technical design](C-TECHNICAL.md)
- [D. Build plan](D-BUILD-PLAN.md)
- [E. Submission and demo package](E-SUBMISSION.md)
- [F. Execution handoff, ending with open questions and decisions](F-HANDOFF.md)

## Where this package changes earlier documents
- solc **0.8.30** (docs-pinned) replaces 0.8.28 in `contracts/foundry.toml` (done in task T02).
- Chain config in TypeScript uses viem's built-in `whitechainSepolia`.
- Key pinning stays MUST but is budgeted at 1 hour; the public verify page is the buyer page's verification component on its own route.
- Estimates show the MUST scope alone uses about 25 of about 27.6 working hours, so SHOULD items are explicitly at risk (`D-BUILD-PLAN.md`).
