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
