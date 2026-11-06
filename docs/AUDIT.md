# Audit of the autonomous build (2026-11-06)

Scope: everything since tag `c1`, checked against `docs/SPEC.md`. Evidence is what was run, not what was intended. **Verdict at the end.**

## 1. Scope

| Item | Class | Status | Evidence |
|---|---|---|---|
| `InvoiceSettler` + Foundry tests + verified deploy | MUST | PASS | 49 Foundry tests; verified on Blockscout (both deployments, API says `is_fully_verified`) |
| Invoice sign/verify library | MUST | PASS | 74 tests incl. golden vectors shared with Solidity |
| Relayer (simulate first, WBT budget, rate limit) | MUST | PASS | viem module tests; live settlements |
| SDK (about 20 lines) | MUST | PASS | `createInvoice`, 4 tests; example app is **10** lines (`npm run count:sdk-lines`) |
| Merchant dashboard (create, status, CSV) | MUST | PASS (built, tests) / NOT TESTED in a browser | `/merchant`, render and logic tests, CSV route tests |
| Buyer page with PASS/FAIL | MUST | PASS (built, tests) / NOT TESTED in a browser | render tests, `e2e:api` |
| Public verify page | MUST | PASS (built, tests) / NOT TESTED in a browser | same |
| Key pinning (payee-change warning) | MUST | PASS (built, tests) / NOT TESTED in a browser | `pinning.ts` 6 tests, warning render tests |
| One real USDT payment with explorer link | MUST | PASS | see section 6 |
| README, `WHITECHAIN_FEEDBACK.md` | MUST | PASS | written; README has a Limitations section |
| 2 to 4 minute demo video | MUST | **NOT DONE (human)** | `docs/SUBMISSION-CHECKLIST.md` |
| Pay-on-due-date with pre-due balance check and Failed state | SHOULD | PASS | 33 scheduler and route tests with a fake clock; live collection tx |
| Capped refunds (contract + tests, no UI) | SHOULD | PASS | refund unit and fuzz tests plus a stateful invariant; live refund and cap rejection |
| Health check, buyer cancel | SHOULD (added by the run) | PASS | viem tests, route tests; live cancel tx |
| Mocked Soul badge | STRETCH | PASS | exact wording tested; example mode only |
| Hosting (T30), refund UI, real Soul reads, stealth, webhooks | OUT | not built, as planned | README "Not built" |

Nothing outside the authorised list was added. Additions beyond the original task list, all inside the authorised scope: `POST /api/invoices/:hash/collect` (a "Collect now" control for demos), `GET /api/invoices/:hash/health`, `POST /api/invoices/:hash/cancel`, a per-IP limit on invoice creation, and `scripts/e2e-due.ts` / `e2e-refund.ts`.

BLOCKED or SKIPPED items: none. The redeploy succeeded first time.

## 2. Tests (clean clone of `origin/main`, `npm ci`, then `npm run test:all`)

| Suite | Result |
|---|---|
| invoice-lib | 74 passed |
| server | 137 passed at the clean-clone run (143 after the review fixes in section 3) |
| web | 54 passed in the clean clone; **53 passed** after the web app was replaced (see section 9), plus 5 opt-in server-mode smoke tests |
| sdk | 4 passed |
| Foundry | 49 passed (fuzz and invariant included) |
| `tsc --noEmit` + `vite build` | clean in the clone (run from PowerShell; see note) |

Note: from Git Bash, `npx tsc` inside a workspace folder resolved the unrelated `tsc` npm package on this machine. Use `npm run build -w <workspace>`; it works.

Live runs on the redeployed contract: `npm run e2e -- --attack-only`, `npm run e2e`, `npm run e2e:api` (11/11), `npm run e2e:refund`, `npm run e2e:due`. After the review fixes the API and due-date scripts were rerun against a mock server and then, later on 2026-11-06, against the **live testnet** with the final code: `npm run e2e:api` passed 11/11 (settle [0x440a1268...6e87](https://explorer.testnet.whitechain.io/tx/0x440a1268a4e734f39014cdd24a41e84b0f758b6a24499b2668838fd855146e87)) and `npm run e2e:due` passed (collection [0x6e48afc0...93c0](https://explorer.testnet.whitechain.io/tx/0x6e48afc0ff3a73491e6a955ee9b87a229314a157366f34c90c60b133b1c793c0), cancel [0x7dec29c9...51dc](https://explorer.testnet.whitechain.io/tx/0x7dec29c926225152065931f0e5c0f32c964cd6db2411218d8d863e142c2851dc)). All three read `ok` on Blockscout.

NOT TESTED live: the AT_RISK and FAILED collection paths (need a drained real buyer wallet); they are covered with the mock chain and a fake clock.

## 3. Security and correctness review

A `code-review` pass at high effort over `c1..HEAD` reported 10 findings. Disposition:

| Finding | Disposition |
|---|---|
| In-flight marker not released if the first store write fails | **Fixed**, with test |
| One failed disk write permanently poisoned the store's write queue | **Fixed**, with test |
| A chain `PENDING` error on cancel turned into an undefined HTTP status | **Fixed**: shared error handler, cancel answers 202 and the scheduler reports CANCELLED, with test |
| Buyer could not pay after a cancelled or failed schedule | **Fixed** in the Pay page (pay form stays for FAILED and CANCELLED while unexpired) |
| Pay-now overwrote a stored due-date authorization | **Fixed**: 409 while scheduled, with test |
| Scheduler claimed the invoice only after an await (race with the pay route) | **Fixed**: claimed before the first await, with test |
| CSV showed 1970-01-01 for "on receipt" | **Fixed**, with test |
| Account switching in the wallet not followed | **Fixed** (`accountsChanged`) |
| No rate limit on invoice creation | **Fixed** (30 per minute per caller), with test |
| `GET /api/merchants/:address/invoices` and CSV need no login | **NOT FIXED, documented** in the README Limitations: needs a signed challenge, out of scope |
| Whole-file JSON rewrite on every change | **NOT FIXED, documented** (single-server JSON store) |

My own checks:
- **Secrets:** no `.env`, key or broadcast files tracked (`.env.example` only); a search of the whole git history for key assignments (`PK`, `PRIVATE_KEY`, `secret`, `mnemonic` followed by a 64-hex value) found none. The only 64-hex keys in the repo are the public Anvil development keys used in tests and golden vectors. `.gitignore` covers `.env*`, `node_modules`, `dist`, `out`, `cache`, `broadcast`, `apps/server/data`.
- **Contract:** `settle` checks expiry, token allowlist, amounts and payer lock, rejects a second settlement, verifies the merchant's signature (EOA or ERC-1271), records the payment **before** the token call, requires the exact balance change, and pays only `inv.payout`. `refund` records `refunded` before the token call, requires the payout wallet's own EIP-3009 signature whose value and nonce (`keccak256("REFUND", hash, refunded)`) are fixed by the contract, pays only the recorded payer, and is capped. Both are `nonReentrant`. The owner can only pause and unpause. No custody: the contract's token balance is zero after each call (invariant tested). **Not audited by a third party.**
- **Server:** CORS only for `WEB_ORIGIN`; error bodies carry no stack traces or URLs; the domain fetch keeps its SSRF guard (private IPs, redirects, size, timeout tests pass); the relayer keeps its WBT budget and rate limit; the server computes invoice hashes itself and never trusts a client hash; the chain module refuses to send unless the RPC reports chain 1874.
- **Known trust limits** (stated in the README): domain file as trust anchor, localStorage pins, EOA-only off-chain checks, upgradeable and blocklist-capable token.

## 4. Claims

Searched the README, UI strings, SDK and library for first/only/guaranteed/trustless/secure/"verified business"/"needs Whitechain"/"locked funds". No over-claim found. "Commitment, not locked funds" and "snapshot, not a lock" appear in the app footer, the pay and schedule screens and the README. EXAMPLE DATA appears in the banner, tags, example form data and README. The Soul badge reads exactly "Individual KYC-verified on WhiteBIT (demo data, mocked)"; its tooltip says it says nothing about the business. The README states plainly that other entries overlap, including one with platform-attested domain verification.

## 5. Repo hygiene

- `npm run check:commits`: 108 commits, **0 over** the 1000-line limit.
- No vendored dependencies (submodules for forge-std and OpenZeppelin), no build output tracked.
- `git status` clean; `main` pushed; tags `c1` to `c5` exist. `c5` marks the docs-complete commit; the review fixes came after it.
- A scratch clone at `D:\truce-audit\` was used for the clean-clone test; it is outside the repo and can be deleted.

## 6. On-chain evidence

Every transaction linked in the README and the feedback file was fetched from the Blockscout API: all 9 are `success` with the expected method (`settle`, `refund`, `receiveWithAuthorization`, `cancelAuthorization`). Both `InvoiceSettler` deployments report `is_verified` and `is_fully_verified` (solc 0.8.30).

## 7. Flows nobody has seen in a browser

The assistant had no browser. These were verified only through component tests, API tests and chain scripts; **you must click them once** (steps and expected results are in `docs/SUBMISSION-CHECKLIST.md`):

1. Wallet connect, add/switch to chain 1874, account switching.
2. The EIP-712 invoice signing prompt on the merchant page.
3. The EIP-3009 payment signing prompt, one signature, no gas, and the receipt.
4. Pay on the due date, the Scheduled and At risk states, Collect now, Cancel my authorization.
5. The payee-changed warning and its acknowledgement box.
6. CSV download and the copy-to-clipboard buttons.
7. Layout on a small screen and the sticky EXAMPLE DATA banner.

## 8. Verdict

**READY WITH CAVEATS.**

The contract, library, relayer, server, scheduler, refund, cancel and the tests are done, verified on chain and reproducible from a clean clone. The remaining risk is the part nobody could see:

1. The wallet screens have never been run in a real browser (section 7). A small UI bug there would hurt the demo most.
2. The video is not recorded and the submission is not made. Both are yours, with a deadline of 09:00 IST on Nov 7.
3. Another entry offers platform-attested domain verification; the README states the difference. Reread their source before you pitch.
4. The merchant invoice list is public to anyone who knows the signing address (documented).
5. Everything is testnet, example data and an unaudited contract. The README says so.

Remaining human steps and times: about 15 minutes for the click-through, about 45 minutes to rehearse and record, about 15 minutes to fill in the ETHGlobal form and select Whitechain.

## 9. Update after the web app was replaced (2026-11-06, later)

`origin/main` received a new `apps/web` from a second contributor (landing page, `/setup`, `/demo`, new `/pay`, `/verify`, `/merchant`; the first web app's pages and tests were removed). Sections 1, 2 and 7 were written for the first web app; read them with these corrections:

- **Tests on the merged tree:** invoice-lib 74, server 143, web 53, SDK 4 pass; the web build is clean. Foundry was not rerun (no contract changes).
- **Default mode is mock.** The new app uses `VITE_API_MODE=mock` unless told otherwise: pages then use a scripted adapter and never reach the server or chain. The checklist now says to set `VITE_API_MODE=server` and to open `http://localhost:5173` (CORS allows only that origin).
- **Server mode checked without a browser.** `npm run smoke:web` runs the new app's own HTTP client, response mapping and typed-data seam against a running server and signs as the example merchant and buyer. 5/5 passed on the mock chain: config and health mapping; create (server hash equals the page's hash), get, verify (10 checks, PASS), pay now to PAID, merchant list, CSV, second payment refused; a swapped-payout copy FAILS (`signature_valid`, `payout_in_domain_file`) and is refused at create; a validly signed but unlisted payout FAILS on `payout_in_domain_file` alone; pay on the due date to SCHEDULED_OK with mode `due`, then cancel to CANCELLED. A browser CORS preflight from `http://localhost:5173` passes. Not run against the live testnet through this client.
- **Design fact worth knowing:** invoice creation and `authorize` check the merchant's signature, not the domain file. A payout the merchant key signed but never listed in `truce.json` shows FAIL and disables Pay in the app, but the API itself would still accept it. The contract pays only the signed payout, so this is the merchant's own choice, not a redirect by a third party.
- **Demo gap:** the new create form takes a calendar due date (00:00 UTC) only. The first app had a "due in N minutes" field. Without it a time-compressed scheduled-then-collected moment cannot be shown from the UI: a date of today collects within seconds, a future date stays scheduled. The scripts (`npm run e2e:due`) still show it.
- Still unclicked in a real browser: everything in section 7, now on the new screens.
