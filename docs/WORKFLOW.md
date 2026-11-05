# Solo workflow (one developer)

Decided 2026-11-05 23:21 IST: **one developer builds everything.** Deadline Sat 2026-11-07 09:00 IST, about 33 hours away. Plan for about 6 hours of sleep, leaving about 27 awake hours. The MUST scope alone is about 25 of them (`design/D-BUILD-PLAN.md`), so slack is about 2 hours and SHOULD items are opportunistic.
The chain/api/web split in `ARCHITECTURE.md` stays as **code organisation** (clear module boundaries), not as team ownership. Task ids (T01 to T31) and acceptance criteria are in `design/D-BUILD-PLAN.md`; ready-to-paste prompts for the first five tasks are in `design/F-HANDOFF.md`.

## How to build: vertical slices with a safety net first
Build the thinnest end-to-end path first, then widen it. After each checkpoint `main` must be demo-ready, tagged (`git tag c1`, `c2`, ...), and tests must pass.
| Slice | Work (task ids) | Target time (IST) | Checkpoint (must be true) |
|---|---|---|---|
| S0 | Fund two throwaway wallets, run live Gate 1 (T01); contract workspace (T02) | Nov 5 23:50 to Nov 6 01:20 | Gate 1 live PASS, or switch to the `permit` fallback |
| S1 | `InvoiceSettler` + Foundry tests, invoice library, golden vectors, deploy and verify, CLI script (T03, T04, T06, T07, T08, T10) | to about 07:20 Nov 6 | **C1 safety net:** verified contract on 1874 and one real USDT settlement with an explorer link from a script; swapped payout reverts. Then sleep (about 6 h, 07:20 to 13:20) |
| S2 | Verify pipeline, chain module (real and mock), server, buyer page, public verify page (T09, T11, T11b, T14 to T19) | 13:20 to about 23:20 Nov 6 | **C2:** browser flow works: PASS then pay; swapped payout shows FAIL; verify page. **50% Go/No-Go at about 16:25** |
| S3 | Merchant page, dashboard, CSV, SDK, example merchant app (T20, T21, T22) | to about 02:05 Nov 7 | **C3:** the full demo path runs without scripts |
| S4 | Key pinning (T23) | to about 03:05 Nov 7 | **C4 = FEATURE FREEZE.** After this: fixes only. SHOULD items (T05, T13, T24, T12, T25) happen only if a checkpoint was reached early |
| S5 | README, feedback file, record the demo (2 to 4 min), radar rerun, submit (T26 to T29) | to about 06:25 Nov 7 | **C5:** submitted (Whitechain selected) by 08:00 with an hour of buffer |
Shift the clock times if you start later; keep the order and the checkpoint rules.

## Cut gates (decide by the clock, not by feel)
- **50% Go/No-Go (about 16:25 Nov 6):** Go needs C1 tagged and T09, T14, T15 done. Otherwise drop all SHOULD and COULD items, reduce the web app to buyer page plus verify page (merchant creates invoices by script), keep CSV as script output.
- Missed **C1** by 09:00 Nov 6: stop widening. Make the script plus a minimal page the product.
- Missed **C2** by 01:00 Nov 7: no merchant dashboard UI; the SDK and script create invoices.
- Missed **C3** by 04:00 Nov 7: no SDK demo app; the buyer page and CSV script are the story.
- **Solo trims already decided:** webhooks are roadmap; the Soul badge is out unless more than 2 hours are spare after C4; no database (JSON-file store); plain functional UI; `CHAIN_MODE=mock` kept so the UI can be built without the chain.
- Cut order if everything is late: Soul badge, hosting, CSV styling, due-date mode, pinning. **Never cut:** on-chain payout enforcement, the PASS/FAIL badge, one real USDT payment, the swapped-payout demo.

## Git and commits
- Work on `main` or very short branches; merge before each checkpoint. No force-push after the repo is shared; push to the public remote at C1 so judges see steady history.
- **Commit size rule: no commit may insert or delete more than 1000 lines** (ETHGlobal flags giant commits). Aim for a few hundred, one logical change per commit. Run `npm run setup:hooks` once per clone (already enabled in this clone) and `npm run check:commits` before each checkpoint. Never vendor dependencies; add them in small batches so the lockfile change stays under the limit.
- Commit often with a real message; judges read the history. Never commit `.env`, keys, or `node_modules`.

## Rhythm
Every 3 to 4 hours: tick the status checklist in `CLAUDE.md`, run tests, commit, check the clock against the table. If stuck on one problem for more than 45 minutes, use the mock or the fallback and move on.

## Definition of done per slice
- Contract: tests pass, deployed and verified on chain 1874, ABI committed, explorer link in the README.
- Chain module: works against Sepolia and has a mock; simulates before sending; no key in the repo.
- Server/UI: works with `CHAIN_MODE=mock` and with `testnet`; example data is labelled EXAMPLE DATA; errors are readable.
- Docs: any claim in the README is either tested or marked "not tested".
