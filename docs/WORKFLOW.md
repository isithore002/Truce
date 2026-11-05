# Solo workflow (one developer)

Decided 2026-11-05 23:21 IST: **one developer builds everything.** Deadline Sat 2026-11-07 09:00 IST, about 33.6 hours away. Plan for about 6 hours of sleep and about 2 hours of buffer, leaving roughly 25 hours of building.
The chain/api/web split in `ARCHITECTURE.md` stays as **code organisation** (clear module boundaries), not as team ownership.

## How to build: vertical slices with a safety net first
Build the thinnest end-to-end path first, then widen it. After each checkpoint `main` must be demo-ready, tagged (`git tag c1`, `c2`, ...), and tests must pass.
| Slice | Work | Target time | Checkpoint (must be true) |
|---|---|---|---|
| S0 | Fund two throwaway wallets, run live Gate 1 (`gate/`) | to about 01:00 Nov 6 | Gate 1 live PASS, or switch to the `permit` fallback |
| S1 | `InvoiceSettler` + Foundry tests, `packages/invoice-lib` (type, hash, sign, verify), golden vector, CLI script: create -> sign -> authorize -> settle, deploy and verify | to about 06:00 Nov 6 | **C1 safety net:** verified contract on 1874 and one real USDT settlement with an explorer link, from a script. Swapped payout reverts. Then sleep (about 6 h) |
| S2 | Server (one process, JSON-file store): create, get, verify (domain-file fetch, example domains from fixtures), authorize + settle now. Buyer page (PASS/FAIL, sign, pay) and public verify page | about 12:00 to 18:00 Nov 6 | **C2:** browser flow works: PASS then pay; swapped payout shows FAIL |
| S3 | Merchant dashboard (create, list, status, CSV), SDK (~20 lines), example merchant demo app | to about 21:30 Nov 6 | **C3:** the full demo path runs without scripts |
| S4 | Key pinning, due-date mode (`validAfter` + scheduler), health check + AT_RISK / FAILED, buyer cancel; refund in contract + tests only | to about 01:30 Nov 7 | **C4 = FEATURE FREEZE.** After this: fixes only |
| S5 | README, `WHITECHAIN_FEEDBACK.md`, record the demo (2 to 4 min), rerun radar, submit | to about 08:00 Nov 7 | **C5:** submitted (Whitechain selected) with an hour of buffer |
Shift the clock times if you start later; keep the order and the checkpoint rules.

## Cut gates (decide by the clock, not by feel)
- Missed **C1** by 08:00 Nov 6: stop widening. Make the script plus a minimal page the product.
- Missed **C2** by 20:00 Nov 6: drop due-date mode, health check and pinning from the plan (pinning last to go).
- Missed **C3** by 23:30 Nov 6: no SDK demo app; the merchant page alone is the integration story.
- **Solo trims already decided:** webhooks are roadmap; the Soul badge is out unless more than 2 hours are spare after C4; no database (JSON-file store); plain functional UI; `CHAIN_MODE=mock` kept so the UI can be built without the chain.
- Cut order if everything is late: Soul badge, webhooks, CSV styling, due-date mode, pinning. **Never cut:** on-chain payout enforcement, the PASS/FAIL badge, one real USDT payment, the swapped-payout demo.

## Git and commits
- Work on `main` or very short branches; merge before each checkpoint. No force-push after the repo is shared.
- **Commit size rule: no commit may insert or delete more than 1000 lines** (ETHGlobal flags giant commits). Aim for a few hundred, one logical change per commit. Run `npm run setup:hooks` once per clone (already enabled in this clone) and `npm run check:commits` before each checkpoint. Never vendor dependencies; add them in small batches so the lockfile change stays under the limit.
- Commit often with a real message; judges read the history. Never commit `.env`, keys, or `node_modules`.

## Rhythm
Every 3 to 4 hours: tick the status checklist in `CLAUDE.md`, run tests, commit, check the clock against the table. If stuck on one problem for more than 45 minutes, use the mock or the fallback and move on.

## Definition of done per slice
- Contract: tests pass, deployed and verified on chain 1874, ABI committed, explorer link in the README.
- Chain module: works against Sepolia and has a mock; simulates before sending; no key in the repo.
- Server/UI: works with `CHAIN_MODE=mock` and with `testnet`; example data is labelled EXAMPLE DATA; errors are readable.
- Docs: any claim in the README is either tested or marked "not tested".
