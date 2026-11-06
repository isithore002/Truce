# Autonomous run log

Started 2026-11-06. Plan: `docs/prompts/AUTONOMOUS-RUN.md`. One line per task: id, commit, tests, result.

## Phase 0: preflight
- Baseline green: Foundry 35, invoice-lib 62, server 101, web 19. main clean and in sync with origin.

## Phase 1: merchant side (C3)
- lib `buildInvoice`/`buildDomainFile`/`parseUsdt` (commit 520ec13): invoice-lib 71 tests.
- T21 SDK `createInvoice`, `invoiceStatus` (34c632b): 4 tests, routed through the real server app.
- T22 example app (0a0f846): 10 lines of integration code, counted by `npm run count:sdk-lines` (limit 20). Ran against a mock server and created an invoice.
- T20 merchant page (`/merchant`): setup + truce.json generator, invoice form, dashboard, CSV button, Home card. Web tests 31. Dev server serves /merchant (HTTP 200), `npm run e2e:api` 11/11 against mock.
- NOT verified in a browser: wallet connect, add chain, EIP-712 signing prompt, clipboard, CSV download click. Tags `c2`, `c3` mean "built and tested", not "seen".
- Suites: Foundry 35, lib 71, server 101, web 31, sdk 4.

## Phase 2: key pinning (C4)
- T23: `apps/web/src/pinning.ts` (browser localStorage, per docs/INTERFACES.md: pin recorded after a first successful payment; later change of signer or payout shows `PinWarning` with old and new wallets side by side; Pay needs an acknowledgement checkbox). Verify page shows the same warning read-only. Web tests 40 (pinning 6, render +3).
- Limit: pins live in one browser, so a new browser or cleared storage starts with no pin (stated in README later). Not seen in a browser.

## Phase 3: refund (T05) and redeploy
- Contract: `refund(hash, amount, Auth)` signed by the payout wallet (EIP-3009, nonce `keccak256("REFUND", hash, refundedSoFar)`), pays only the recorded payer, capped (`RefundExceedsPaid`), works while paused; `paidToken`, `refundNonce` views; Payment struct grew a token slot (settle gas about +22k). Foundry 49 tests (refund unit + fuzz + stateful invariant: refunded <= paid, settler holds 0). Commits 76bbf5b, 715bdb2.
- Redeployed and verified on Blockscout: `0xCbe41B98D2333a1BD92d51Fbb6FE668c5170ff9d`, tx 0x2f5bbaee...a586, block 12329221, 1,521,831 gas. Old contract recorded as `previous`.
- Live on the new contract: `npm run e2e -- --attack-only` (swapped payout rejected), `npm run e2e` settled (tx 0xd34ac0c2...efed), `npm run e2e:api` 11/11 live (tx 0x99291356...16b9), new `npm run e2e:refund` (settle 0xf2945011...148a, refund 0x9e15507d...2e79, cap rejection). Lib: `refundNonce`, `signRefundAuthorization` (73 tests).
- Not built (by design): refund UI and server route.
- Note: a stale mock server from earlier is still bound to port 8787 (could not be stopped by PID in this session); live runs used PORT=8788.

## Phase 4: due-date mode (T13, T24) and Phase 5: health and cancel (T12, T25)
- Chain: `ViemChain.health` (balance, `authorizationState`, `isBlocked`, expiry within an hour; failed `isBlocked` read counts as not blocked) and `cancelAuthorization` (simulate first, relayer pays gas). 8 new tests.
- Scheduler (`apps/server/src/scheduler.ts`): collects after `validAfter` (strictly after + margin), asks the chain first whether the invoice is paid, retry backoff 30/60/120/.../600 s until `validBefore`, then FAILED; non-recoverable errors (cancelled authorization, wrong payer) fail at once; AUTH_INVALID within 120 s of validAfter is treated as clock skew and retried; health refresh every 60 s before the due date (AT_RISK / back to SCHEDULED_OK); all state in the store so a restart resumes; shared `inFlight` set with the HTTP route prevents a double send; `collectNow`.
- Routes: `authorize` with `mode:"due"` (checks window = due date..expiry, payer lock, buyer signature locally, pre-due balance/blocked check; scheduled invoices cannot be overwritten), `GET /api/invoices/:hash/health`, `POST /api/invoices/:hash/cancel` (buyer-signed, relayed), `POST /api/invoices/:hash/collect`. `effectiveStatus`: a scheduled invoice past its expiry reads FAILED, not EXPIRED.
- Web: Pay page offers Pay now / Pay on the due date, shows Scheduled / At risk / Failed / Cancelled, Cancel button; Merchant form has "due in N minutes (demo)"; dashboard shows health reason, collect time and "Collect now".
- Tests: server 137 (due.test.ts 28), web 51, lib 74.
- LIVE on the new contract: `npm run e2e:due` (new): invoice A scheduled ~70 s ahead and collected by the scheduler (tx 0xe4f4df28...6882); invoice B scheduled then cancelled by a buyer-signed CancelAuthorization relayed on chain (tx 0xe8fce82e...3c2a), never collected; health snapshot OK for both.
- Not live-tested: AT_RISK/FAILED paths (needs draining the real buyer wallet); they are covered with the mock chain and a fake clock.

## Phase 6 to 8: Soul badge, docs, submission prep
- T31 mocked Soul badge: exact wording, example mode only, tooltip says it says nothing about the business; tests check the string and absence outside example mode. Web tests 54.
- README rewritten (limitations, live links, run steps, overlap), WHITECHAIN_FEEDBACK additions, AI-USE account, C-TECHNICAL notes, CLAUDE.md status. Tag `c5` set after this phase.
- Radar rerun 2026-11-06: 49 payment/invoice-like contracts since 2026-11-03. Domain/DNS verification flagged on 3: our two deployments and `MerchantRegistry 0xF6B60D212abd955a6d4937535f89B5B7b6426C47` (another entry: platform attestor records a domain after an off-chain DNS/.well-known check). Pitch unchanged; README "Overlap" paragraph states the difference without first/only claims. Also overlapping on features: PaymentRouter, PaymentProcessor, Checkout.
- `npm run check:commits`: 106 commits, 0 over the limit.
- `docs/SUBMISSION-CHECKLIST.md` written (browser click-through, video, submit). Nothing was submitted.
