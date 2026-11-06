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
