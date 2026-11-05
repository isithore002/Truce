# Truce: context for Claude Code sessions

ETHGlobal Mumbai 2026, Whitechain **Operate** track. **Submission deadline: Sat 2026-11-07 09:00 IST.** Select Whitechain in the ETHGlobal dashboard (one Whitechain prize per project).
Read `docs/SPEC.md` first: its top block is the FROZEN scope and the source of truth. The full design package (diagrams, API, contract design, build plan, demo script, ready-to-paste task prompts) is in `docs/design/00-INDEX.md`. `docs/README.md` indexes every other document (decisions log, competitors, Whitechain research, Soul, booth notes, pitch and judge Q&A, verified chain facts).

## What we are building
Invoices a buyer can verify before paying, collected on the due date, paid gaslessly in USDT on Whitechain Sepolia.
A merchant publishes `/.well-known/truce.json` (signing wallet + payout wallet) and issues EIP-712 signed invoices. The buyer app shows PASS/FAIL against that file.
The buyer signs one EIP-3009 `receiveWithAuthorization` (pay now, or valid from the due date). A relayer pays gas in WBT. Our contract `InvoiceSettler` verifies the merchant signature,
pays only the signed payout wallet, settles each invoice once, and supports capped refunds. Hero demo moment: a swapped payout wallet FAILS in the app and reverts on chain.

## Frozen scope (change rule: nothing is added unless something of equal size is removed)
- MUST: `InvoiceSettler` + Foundry tests + verified deploy; invoice sign/verify library; relayer; SDK (~20 lines for a merchant app); merchant dashboard (create, status, CSV); buyer page with PASS/FAIL;
  public verify page; key pinning (payee-change warning); one real USDT payment with explorer link; README; `WHITECHAIN_FEEDBACK.md`; 2-4 min demo incl. the swapped-payout attack.
- SHOULD: pay-on-due-date with a pre-due balance check and a clear Failed state; capped refunds (contract + tests only, no refund UI).
- STRETCH: mocked Soul badge, only if more than 2 hours are spare after checkpoint C4. OUT: stealth addresses, real Soul reads, mainnet transactions, DNSSEC, approvals, auditor package, webhooks (solo build).
- Cut order if late: Soul badge, key pinning, CSV styling, due-date collection. Never cut: on-chain payout enforcement, PASS/FAIL badge, one real USDT payment.

## Hard rules
1. **Testnet only (chain 1874).** No mainnet transactions (they cost real WBT). Mainnet reads are fine.
2. **Throwaway keys only.** Never commit `.env` or keys; never paste a key into chat. The gate script refuses any chain id other than 1874.
3. **Write the contract from scratch.** Do not copy other teams' contracts (e.g. `PaymentRouter`). We read them only to assess overlap.
4. **Honest labels:** example data must show "EXAMPLE DATA" (fictional "Northlight Design Studio" bills "Beta Labs" 1,250 USDT, net 30, time-compressed in the demo and say so on screen).
   The Soul badge, if built, says exactly: "Individual KYC-verified on WhiteBIT (demo data, mocked)". Never write "verified business" (IsVerified reflects personal KYC; KYB has no timeline).
5. **No over-claims.** Do not say first/only/guaranteed/"needs Whitechain". The signed authorization is a commitment, not locked funds; the health check is a snapshot, not a lock. State limits in the README.
6. **Commit size limit: no commit may insert more than 1000 lines OR delete more than 1000 lines.** ETHGlobal checks the commit history and large single commits can disqualify us. Aim far lower (a few hundred lines, one logical change per commit).
   - Counts everything: generated files, lockfiles, ABI JSON, vendored code. Never vendor dependencies (use a git submodule or npm). Add dependencies in small batches and commit the lockfile after each batch. Do not commit build output.
   - Check before committing: `npm run check:commits` (whole history) or `node tools/check-commit-size.js --staged`. Enable the blocking pre-commit hook once per clone: `npm run setup:hooks`.
   - If something is over the limit, split it (`git add <files>`, `git add -p`) before committing. Do not rewrite history after the repo is pushed or shared.
   - History was rebuilt into small commits on 2026-11-05 (the first scaffold commit had been +31,689 lines because forge-std was vendored; it is now a submodule: run `git submodule update --init --recursive` after cloning).
7. End commit messages with the attribution line the harness provides. Document AI use in `docs/AI-USE.md`. Commit often under your own git identity.
8. Ask before expanding scope. Prefer the simplest thing that works and is tested.

## Verified facts
- Chain `1874` (0x752). RPC `https://rpc.testnet.whitechain.io` (50 req/s/IP, burst 500, batch 100); backup `https://rpc.ankr.com/whitechain_testnet`. Explorer `https://explorer.testnet.whitechain.io` (Blockscout, public API v2, no key). Gas token WBT (18 decimals), 1s blocks, 5 gwei base-fee floor + L1 data fee.
- Faucet: `https://faucet.testnet.whitechain.io`, GitHub account >= 30 days old. Drip: docs say 0.5 WBT/24h, booth flyer says 2 WBT/day (unconfirmed). Test USDT: swap WBT on YetiTrade.
- **Track USDT** `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`: 6 decimals, EIP-1967 proxy, has `receiveWithAuthorization`, `transferWithAuthorization`, `cancelAuthorization` (v,r,s and bytes overloads), `authorizationState`, `permit`, `isBlocked`.
  **EIP-712 domain: name "Tether USD", version "1", chainId 1874, verifyingContract = the proxy address** (reconstructed locally and matched on-chain `DOMAIN_SEPARATOR`; see `gate/`).
  `receiveWithAuthorization` requires `msg.sender == to` (our contract will be `to`). Do NOT use the other USDT on Sepolia (`0xaa79...8f46`, "USDT.e").
- Mainnet (1875) has no official USDT yet. Mainnet USDC.e `0xF97B9Bf62916f1EB42Dd906a7254603e7b9FC4a7` is Circle FiatTokenV2_2 (has the 3009 functions per its verified ABI; untested by us).
- Booth (Whitechain team) answers: do not wait for Soul on Sepolia, mock it and label it; IsVerified = personal KYC; KYB planned, no timeline; registry owner key: no answer; `PaymentRouter` is probably another team's entry; due-date collection fits B2B invoices with terms;
  add a pre-due balance check and a clear failed state; show the swapped-payout FAIL; use a made-up labelled example merchant.

## Layout
One developer builds everything. The plan, checkpoints (C1 to C5) and cut gates are in `docs/WORKFLOW.md`; read it with `docs/ARCHITECTURE.md` and `docs/INTERFACES.md` before building.
- Modules (code organisation, not team ownership): `contracts/`, `packages/invoice-lib/`, `apps/server/src/chain/` (relayer, health, scheduler), `apps/server/src/api/` (REST, store, domain check, CSV), `apps/web/`, `sdk/`, `examples/merchant-demo/`, `gate/`, `tools/`.
- Use `CHAIN_MODE=mock` to build the UI without the chain. Build vertical slices; keep `main` demo-ready at every checkpoint and tag it (`c1`, `c2`, ...).

## Commands
- Gate 1 (read-only, no keys): `cd gate && npm install && npm run gate`. Live (needs `gate/.env` with two throwaway keys): `npm run gate:live:cancel`.
- Competitor radar: `node tools/competitor-radar.js --pages 6 --since 2026-11-03T00:00:00Z --deep` (rerun before submitting; if anyone shows "domain/DNS verification", reconsider the pitch).
- Contracts: `cd contracts && forge build && forge test` (first clone: `git submodule update --init --recursive` for forge-std).
- Commit-size check: `npm run check:commits`; enable the hook: `npm run setup:hooks`.

## Status (update as you go; times are targets, see docs/WORKFLOW.md)
- [x] Spec frozen; booth feedback folded in; team size = one developer
- [x] Repo scaffolded, history rebuilt into small commits, commit-size hook enabled
- [x] Gate 1 read-only PASS (domain name/version resolved)
- [x] S0: Gate 1 LIVE PASS 2026-11-06 (redeem, replay/payee/window rejections, signed cancel; recorded in `WHITECHAIN_FEEDBACK.md`)
- [x] C1 safety net DONE 2026-11-06 (tag `c1`): `InvoiceSettler` `0xB1e1c081D5FB009D8f908b220D902E9F98dfbFE7` verified on 1874, one real 0.01 USDT settlement (tx `0xed25b41a...88fb`), swapped payout rejected. Also done: invoice-lib incl. verify pipeline (T08 to T10), chain module real + mock (T11, T11b). Next: T14 to T16 server routes, then the web app (C2).
- [ ] C2 (about 23:20 Nov 6; 50% Go/No-Go about 16:25): browser flow: PASS then pay now; swapped payout shows FAIL; verify page
- [ ] C3 (about 02:05 Nov 7): merchant dashboard, CSV, SDK, example merchant demo app
- [ ] C4 = FEATURE FREEZE (about 03:05 Nov 7): key pinning (MUST); due-date mode, health check, cancel, refund only if ahead of schedule
- [ ] C5 (by 08:00 Nov 7): README, `WHITECHAIN_FEEDBACK.md`, demo video (2-4 min), radar rerun, `npm run check:commits`, submit (Whitechain selected)

## Open items (do not block)
Soul registry owner key (README open question); whether other entries appear with domain verification (radar).
