# Autonomous run: full scope (MUST + SHOULD + STRETCH), then audit

Written 2026-11-06. Deadline: **Sat 2026-11-07 09:00 IST** (submit by 08:00).
The user authorised the SHOULD and STRETCH items below on 2026-11-06 ("run autonomous mode for full stretch"). That is the written exception to the scope-change rule in `docs/SPEC.md`; record it in `docs/DECISIONS-LOG.md` in Phase 0. Nothing outside this list may be added.

## How to start (paste this into a fresh Claude Code session at the repo root)

```
Read CLAUDE.md, then docs/prompts/AUTONOMOUS-RUN.md, and execute it end to end without asking me questions.
Work phase by phase in order. Keep a running log in docs/AUTONOMOUS-LOG.md (create it in Phase 0; after every task append: task id, commit hash, tests run, result).
If the session restarts, read the log and resume at the first unfinished task.
Finish with Phase 9 (the audit) and then stop. Do not submit to ETHGlobal.
```

## Standing rules (apply to every phase)

1. CLAUDE.md hard rules win over everything here: testnet 1874 only, throwaway keys only, never read or print `.env` or any key, no mainnet transactions, EXAMPLE DATA labels, no over-claims, honest Soul wording.
2. **Commit size:** at most 1000 inserted AND 1000 deleted lines per commit; aim for a few hundred. Run `node tools/check-commit-size.js --staged` before each commit. Add dependencies in small batches and commit the lockfile after each. Never rewrite pushed history.
3. **Commit often**, one logical change per commit, end each message with the attribution line the harness gives. `git push origin main` after each phase gate (no force pushes). Tag `c2`, `c3`, `c4`, `c5` where stated.
4. **Definition of done for a task:** typecheck clean, its tests written and passing, whole suite still green (`cd contracts && forge test`, plus `npm test` in `packages/invoice-lib`, `apps/server`, `apps/web` and `sdk`; there is no root test script, so add `npm run test:all` in Phase 0 that runs them all), then commit. Do not start the next task on a red suite.
5. **No questions.** On a blocker: try the obvious fix once or twice, then log it as BLOCKED with the reason and move on following the cut order. Never fake a result; if something could not be tested, say so in the log and in the README limits.
6. **Cut order if late** (check the clock at every phase gate; the deadline is fixed): Soul badge, key pinning polish, CSV styling, health UI, due-date mode, refund. Never cut: on-chain payout enforcement, PASS/FAIL badge, one real USDT payment, README, the audit.
7. **Time boxes.** If a task exceeds 2x its estimate in `docs/design/D-BUILD-PLAN.md`, stop, log it, and take the cut.
8. Spending: the deployer holds about 1.5 WBT and the relayer about 0.05 WBT. One redeploy plus verification is allowed (Phase 3). Do not run repeated live loops. Stop live runs if the relayer is under 0.01 WBT and log it.
9. Browser: no browser tool is available. Never claim a UI was "seen". Verify with component tests, typecheck, build, dev-server HTTP checks and the API e2e script, and list every UI flow that still needs a human click in the audit.
10. Update the Status block in `CLAUDE.md` and `docs/AI-USE.md` at each checkpoint.

---

## Phase 0: preflight (about 15 min)

- Read `docs/SPEC.md`, `docs/WORKFLOW.md`, `docs/design/D-BUILD-PLAN.md`, `docs/design/C-TECHNICAL.md`, `docs/INTERFACES.md`, `docs/WB-SOUL.md`.
- `git status` clean, `git pull`; run every test suite and record the counts (expected: Foundry 35, invoice-lib 62, server 101, web 19). Stop and fix anything red before going on.
- Create `docs/AUTONOMOUS-LOG.md` and the DECISIONS-LOG entry (full scope authorised 2026-11-06).
- Gate: baseline green, committed, pushed.

## Phase 1: C3 merchant side (T20, T21, T22)

- **T20 merchant page** (`apps/web/src/pages/Merchant.tsx`, route `/merchant`): (a) setup: connect wallet or paste address, choose signing and payout wallet, generate the `truce.json` content to publish at `/.well-known/truce.json`; (b) create invoice form (client name, line items, amount in USDT, due date or on receipt, expiry, optional payer lock) that builds the invoice with `packages/invoice-lib`, signs EIP-712 with the wallet, POSTs `/api/invoices`, and shows the pay link plus copy button; (c) dashboard table: status, amount, due date, payer, tx explorer link, per merchant via `GET /api/merchants/:address/invoices`; (d) CSV button using `GET /api/merchants/:address/export.csv`. Fictional example merchant stays labelled EXAMPLE DATA.
  Tests: form-to-invoice logic as pure functions with vitest; render tests for the table and empty state; `npm run e2e:api` still passes.
- **T21 SDK** (`sdk/`): `createInvoice({ merchantKey|signer, apiBase, ... })` returns `{ link, hash }`. Small, typed, tested against the mock server via `app.inject` or a local listener.
- **T22 example merchant app** (`examples/merchant-demo/`): a small script/app calling the SDK; **integration code 20 lines or fewer**, counted by a script (`npm run count:sdk-lines`) and stated in the README.
- Gate (C3): all suites green, dev server serves `/merchant`, SDK demo creates an invoice against `CHAIN_MODE=mock`. Tag `c2` (browser flow built; note in the log that the wallet flow is human-unverified) and `c3`. Push.

## Phase 2: C4 key pinning (T23, MUST)

- Server store keeps a pin per domain: first seen signing wallet and payout wallets (`pinnedAt`). `GET/POST /api/verify` adds a non-failing `pin` field: `new`, `same`, or `changed` (with old and new values).
- Buyer page and verify page show a clear yellow "Payee changed since you last paid/checked this merchant" warning with old and new wallets side by side when `changed`; Pay stays allowed only after an explicit acknowledgement checkbox.
- Tests: first-seen, unchanged, changed signer, changed payout; render test for the warning.
- Gate (C4, feature freeze for MUST): suites green. Tag `c4`. Push.

## Phase 3: refund (T05, contract) and redeploy

- Add `refund(bytes32 invoiceHash, uint256 amount)` to `InvoiceSettler`: only the original payer can receive; cap `refunded <= amount`; merchant-funded (the merchant pulls from their own balance with prior allowance, or the merchant calls it and the contract `transferFrom`s the merchant). Pick the simplest design that cannot touch other invoices' funds, document it in `docs/design/C-TECHNICAL.md`, no refund UI.
- Tests: cap, double refund, wrong caller, unknown invoice, paused behaviour, contract token balance zero after calls; add to the invariant test (`refunded <= amount`).
- `forge build` with solc 0.8.30 / evm prague, `forge test` green, regenerate `contracts/abi/InvoiceSettler.json` (split the commit if the ABI diff is large).
- **Redeploy** to 1874 with `Deploy.s.sol` (use the deployer from env; never print it), verify on Blockscout, update `deployments/whitechain-sepolia.json` (keep the old address as `previous` with a note that it has no refund), update README links. Rerun `npm run e2e -- --attack-only`, `npm run e2e`, and `npm run e2e:api` against the new contract and record the new tx links. If the redeploy or verify fails twice, revert the contract change on a branch, keep the c1 contract, mark T05 BLOCKED, and continue.
- Gate: suites green, new settlement + swapped-payout rejection on the new address. Push.

## Phase 4: due-date mode (T13, T24)

- **T13 scheduler** in `apps/server/src/chain/`: stores due-mode authorizations, fires `settle` at `validAfter + small margin`, retries with backoff until `validBefore`, marks `FAILED` with the mapped reason after the last attempt, idempotent across restarts (reads the store on boot), never double-sends (reuses the `settling` guard and on-chain `paid` check). Time injected so tests run with a fake clock.
- **T24**: `POST /api/invoices/:hash/authorize` accepts `mode: "due"` (remove the 501); pre-due balance check (balance and `isBlocked`); buyer page gets a "Pay on due date" option that signs an authorization valid from `dueDate` and shows the scheduled state with the honest sentence: "Your authorization is a commitment, not locked funds. If your balance is short on the due date, the payment fails." Add a merchant-visible "Collect now" button for demos (only after `validAfter`).
- Tests: scheduler fires at due time, retry then FAILED, restart resume, double-fire protection, mock-chain end to end. One real live check with a very short due date (about 2 minutes ahead) is allowed once, using 0.01 USDT.
- Gate: suites green; log the live tx. Push.

## Phase 5: health check and cancel (T12, T25)

- **T12** `ViemChain.health(invoice, auth)`: balance vs amount, `authorizationState`, `isBlocked`, time to `validBefore`; returns `OK | AT_RISK | FAILED | USED` with reasons. **Cancel:** relay the buyer-signed `cancelAuthorization` (the lib already has `signCancelAuthorization`; Gate 1 proved it works on the real USDT). Mock mirrors both.
- **T25 UI:** dashboard shows scheduled invoices with a health pill (OK, AT RISK with the reason, FAILED with the reason); buyer page shows "Cancel my authorization" for scheduled invoices (sign cancel, relayer submits, status becomes CANCELLED). Wording says "snapshot, not a lock".
- Routes: `GET /api/invoices/:hash/health`, `POST /api/invoices/:hash/cancel`; schemas and error codes in `INTERFACES.md`.
- Tests: AT_RISK on a drained mock wallet, blocked wallet, cancel marks the authorization used and the scheduler then skips it, route tests.
- Gate: suites green. Push.

## Phase 6: STRETCH mocked Soul badge (T31)

- Only now, and only if the clock allows (check: at least 2 hours before the 08:00 submit target, else log SKIPPED).
- A small `SoulBadge` component on the merchant page and buyer page, **exact text:** "Individual KYC-verified on WhiteBIT (demo data, mocked)". Never write "verified business". Driven by a clearly named fixture, shown only in example mode, with a tooltip explaining it is mocked and that IsVerified reflects personal KYC. No real Soul reads, no new contract.
- Test: exact string, absent outside example mode. Push.

## Phase 7: C5 documentation (T26, T27)

- **README.md:** what it is in two sentences, the hero attack, a 10-minute "run it" section from a clean clone (submodules, install, env, `npm run server`, `npm run dev -w apps/web`, mock vs testnet), architecture diagram or list, SDK snippet with the counted line total, live addresses and explorer links (old and new contract, settlement txs, swapped-payout rejection), "why on chain", and a **Limitations** section: authorization is a commitment not locked funds; health check is a snapshot not a lock; off-chain signature check supports EOA merchants only; testnet only; Soul badge mocked; relayer budget; single-server JSON store; UI wallet flow human-verified only where stated; any BLOCKED/SKIPPED items.
- **WHITECHAIN_FEEDBACK.md:** finalise (worked, stuck, docs lacked), include new findings from Phases 3 to 5.
- **docs/AI-USE.md:** accurate account of what the AI built and what the human did.
- Update `CLAUDE.md` Status block to the real state.
- Gate: a stranger could follow it; every claim is tested or labelled "not tested". Tag `c5`. Push.

## Phase 8: submission prep (automatable parts only)

- `npm run radar` (competitor radar, per CLAUDE.md command with `--deep`); summarise any rival with domain/DNS verification in the log, do not change the pitch.
- `npm run check:commits` must report 0 over the limit.
- Write `docs/SUBMISSION-CHECKLIST.md`: the human-only items with exact steps: manual browser/wallet check, record the 2 to 4 minute video (shot list from `docs/design/E-SUBMISSION.md`, include the swapped-payout attack and say the data is time-compressed example data), select Whitechain in the ETHGlobal dashboard, paste links, submit. **Do not submit.**

## Phase 9: audit (last, mandatory)

Produce `docs/AUDIT.md` with a PASS / FAIL / NOT TESTED line and evidence for each, fixing what is cheap and listing what is not:

1. **Scope:** compare the repo against `docs/SPEC.md` MUST/SHOULD/STRETCH; nothing outside scope was added; list every BLOCKED or SKIPPED item.
2. **Tests:** run every suite from a clean install (`forge test`, invoice-lib, server, web, sdk); record counts; run `npm run e2e:api` against the mock and, if budget allows, once live.
3. **Security:** secrets scan of all tracked files and history (private keys, `.env`, 64-hex strings that are not hashes/vectors); `.gitignore` covers `.env`, data and build output; SSRF guard tests still pass; relayer budget and rate limits on; no endpoint trusts client-supplied hashes; CORS only for `WEB_ORIGIN`; error responses leak no stack traces; review contract for reentrancy, signature replay, payout enforcement and refund cap (use the `security-review` skill, then `code-review` at `high` effort on the whole branch since tag `c1`, and fix confirmed findings).
4. **Claims:** grep the README, UI strings and docs for "first", "only", "guaranteed", "verified business", "needs Whitechain", "locked funds", "trustless", "secure" and justify or remove each; confirm EXAMPLE DATA and the exact Soul wording.
5. **Repo hygiene:** `npm run check:commits` clean; no vendored dependencies; no build output committed; `git status` clean; `main` pushed; tags `c1` to `c5` present.
6. **On-chain evidence:** every explorer link in the README resolves (fetch the Blockscout API for each tx and the verified-contract flag).
7. **Human-only checklist:** list every flow nobody has seen in a browser (wallet connect, add chain, EIP-712 signing prompt, pay, receipt, merchant creation, due-date, cancel) so the user knows exactly what to click before recording.
8. End with a one-screen verdict: READY / READY WITH CAVEATS / NOT READY, the top five risks, and the exact remaining human steps and times. Commit and push, then stop.
