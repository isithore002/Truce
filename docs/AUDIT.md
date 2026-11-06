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
| Hosting (T30), real Soul reads, stealth, webhooks | OUT | not built, as planned | README "Not built" |
| Refund panel and API route, live dashboard, network-fee line, storefront demo app, monthly series | Added later by the developer | built; see section 10 | DECISIONS-LOG "Additions authorised" |

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
- **Demo gap (closed):** the new create form took a calendar due date only, so a time-compressed scheduled-then-collected moment could not be shown. An optional "Demo: due in N minutes" field (1 to 1440, only while the invoice is marked EXAMPLE DATA, needs at least 1 day payable) now sets the due time N minutes after signing. Due times that are not midnight UTC show the time (UTC) on the pay panel, receipt, dashboard and invoice card. Unit tests cover the parser and formatter; `npm run smoke:web` includes an invoice due 6 seconds out that is scheduled through the web client and collected by the scheduler (6/6 pass on the mock chain). The form itself has not been seen in a browser.
- Still unclicked in a real browser: everything in section 7, now on the new screens.

## 10. Additions made after the audit above (2026-11-06, later)

Authorised by the developer in a written exception (docs/DECISIONS-LOG.md, "Additions authorised"). Nothing was removed to pay for them.

| Addition | Evidence | Not verified |
|---|---|---|
| Dashboard refresh every 4 s with a changed-row flash | 6 unit tests for the change detection | Not seen in a browser |
| Receipt "Network fee" row (explorer data for that transaction) | 7 unit tests using a real settlement's values; the explorer API allows browser reads (CORS `*`) | Not seen in a browser; shows nothing in mock mode |
| Storefront demo app, 9 integration lines | 8 server tests; run against the live API, and the created invoice verified PASS with 10 checks | The page was not opened in a browser |
| Refund route and panel | 9 route tests, 7 real-chain-module tests, mock-chain rules, web helper and signing tests, a web-client smoke test. **Live:** `npm run e2e:api` settled 0.01 USDT, then refunded 0.002 USDT to the buyer through the new route. Both transactions read `ok` on Blockscout (settle 0x9b378a38...e281, refund 0x816e2a2b...4605: payout wallet to contract to buyer, 0.002 USDT each way), and an over-cap refund was refused | The panel was never clicked with a wallet; the dashboard list has no refunded badge |
| Monthly series of separate invoices | 9 unit tests for dates (month ends, leap year, year end), notes and the count; a smoke test creates a 3-invoice series through the server and each verifies PASS | Not clicked. A rejected second signature keeps the first invoice by design, but only the helpers are tested, not the form |

Counts after these changes: server 159, web 83 (plus 8 opt-in smoke tests, 8 of 8 passing on the mock chain), demo storefront 8, invoice-lib 74, SDK 4. Foundry 49 was not rerun (no contract change).

Still the biggest risk: no wallet screen, old or new, has been clicked in a real browser. The public Whitechain RPC was also slow at times during this work (one health check took 9 seconds), which can stall a live demo.

### 10b. ERP-style reading, CSV refund fix and ledger export

| Addition | Evidence | Not verified |
|---|---|---|
| Accountant CSV now has `refunded` and `net_received` (it previously showed a refunded invoice as full income) | Server tests: blank before payment, `0` and full net after payment, partial and full refund | Refunds come from this server's recorded events, not read from the chain per row |
| Ledger export: `GET /api/merchants/:address/ledger.csv` and a "Download ledger" button | 12 ledger tests (accounting identities: debits equal credits; receivable, cash and returns balances; ordering; formula-injection safe), route tests after a real pay and refund, a web-client smoke test. **Live:** `npm run e2e:api` now ends by checking the CSV (`refunded 0.002, net 0.008`) and a ledger of issued, payment, refund with the settlement and refund transaction links, both confirmed `ok` on Blockscout (settle 0xb6011c14...4c25, refund 0x2a617de9...decb) | The download buttons were never clicked in a browser |
| ERP-style reading of the architecture | `docs/design/G-ERP-STYLE-VIEW.md`, with a list of what it does not claim | Documentation only |

The ledger has only money entries, uses illustrative account names, and is not accounting software. Counts now: server 172, web 83 (+8 opt-in smoke tests, 8 of 8 passing), library 74, SDK 4, storefront 8, Foundry 49 (not rerun).

### 10c. Merchant-side verdict preview (added after a real click-through showed the gap)

When an invoice is created, the screen now runs the same check the buyer's page runs and shows "Your buyer will see PASS" or "Your buyer will see FAIL", with the failing checks and what to change. It was added because the first real browser run showed a merchant could create and share an invoice for a domain they did not control without being told it would fail. It reads the server's verify result and shows nothing the server did not say.

Evidence: 7 unit tests for the "what to change" advice (including that an unreadable domain file gives one hint, not three), and a smoke test against the server that creates a valid and an unlisted-payout invoice and checks PASS with no hints, and FAIL with the payout hint (9 of 9 smoke tests pass on the mock chain). Not verified: the notice itself was not seen in a browser. For a series it checks the first invoice only.

### 10d. Read-only RPC fallback

The chain module's reads (simulation, receipts, balances, health) now try the primary RPC and then the documented backup; sending stays on the primary only. It was added because the public RPC was slow at times (one health read took 9 seconds). A transaction offered to a second node after a timed-out send could be reported as failed even though it went through, which is why sends do not fail over.

Evidence: 5 tests, 3 of which run the real client against two local HTTP servers acting as nodes (primary down: answered from the backup after the primary was tried; primary healthy: the backup is never contacted; no backup configured: fails as before), and 2 for the setting. **Live:** a temporary server with its primary RPC set to a dead port still returned the real chain id, block number and relayer balance in 2.3 seconds through the backup. Not verified: a payment while the primary is down (by design, sends do not fail over); behaviour of the backup under load.

Final counts at this point: server 177, web 93 (plus 9 opt-in smoke tests, 9 of 9 on the mock chain), library 74, SDK 4, storefront 8, Foundry 49 (not rerun).

### 10e. Clean clone of the pushed repository (commit 03b7126)

A fresh `git clone --recurse-submodules` of origin/main into a new folder on another drive, then `npm ci` (121 packages, 39 s), gave: invoice-lib 74, server 177, web 93 (+9 opt-in smoke tests, skipped by default), SDK 4, storefront 8, Foundry 49 (6 suites), all passing; the web build and the server and storefront typechecks are clean. So the repository reproduces from a clone without any local files, keys or running servers. Not covered: the live scripts (they need keys and a funded relayer) and anything that needs a browser or wallet.

### 10f. "Check my domain" on the Setup page (added after a real click-through)

The Setup page used to mark "publish truce.json" as done as soon as Download was clicked and told the merchant to run `curl`. A merchant using a wallet the domain did not list found out only after signing an invoice. Now step 3 has a **Check my domain** button: the server reads `https://<domain>/.well-known/truce.json` fresh (never cached, so a fixed file is seen at once), compares it with the connected signing wallet, the payout wallet and the network, and answers in plain words (found and listed, not reachable with the reason such as "HTTP 404" or "redirects are not followed", not a valid file, different signing wallet, payout not listed, network not listed). The step turns done only when the check passes for those exact inputs. For a fictional `.example` name the answer says it comes from the server's example list.

Evidence: 20 new server tests (the comparison rules incl. letter case, the route, domain normalisation, refusal of `localhost`, private and link-local names, malformed wallets, rate limit, no caching, fixtures in demo mode only), and a smoke test against the running server (OK, signer mismatch, payout not listed, missing domain, `localhost` refused; 10 of 10 smoke tests pass on the mock chain). **Live** on the testnet server: the example merchant returns OK, another wallet returns SIGNER_MISMATCH with the listed wallet, `example.com` returns "the server answered HTTP 404". Same SSRF guard as verification (https only, no redirects, 3 s deadline, 64 KB cap).

Not verified: the button and result panel were not seen in a browser. **Timing risk:** `isithore002.github.io` took about 2.2 s for DNS, connect, TLS and answer by `curl` from this machine, and two checks through the server timed out at its 3 s deadline, so a slow host can show "the request timed out" to the merchant and to buyers. The deadline was not changed.

Counts at that point: server 197, web 93 (+10 opt-in smoke tests), library 74, SDK 4, storefront 8, Foundry 49 (not rerun).

**Addendum (same day): demo-name registration and automatic checks.** After the first browser run the developer asked for the setup to be automatic. A real domain cannot be automated by Truce: the merchant's own site is the trust anchor, so Truce does not publish for them (and has no access to their host). What is automatic now: the check runs by itself when the setup is saved, and for a fictional `.example` name on a demo server one click ("Register this demo domain", `POST /api/demo-domains`) publishes the file for the connected wallet and re-runs the check. Rules, each tested: demo mode only (404 otherwise), `.example` only, the server builds the file from the wallets given (no arbitrary JSON written), a built-in example cannot be replaced, a name registered by one signing wallet cannot be taken by another (there is no proof of ownership, so this is for fictional names only), rate limited, files kept in a git-ignored folder, and local `.example` files are read on every call so a new registration is seen at once. When the name belongs to another wallet the page offers `<business-name>.example` instead.

Evidence: 8 more server tests (205 in total) and 4 web unit tests, and a smoke case against a running server (check says registration is possible, register, check passes, another wallet is refused, the built-in example is refused; 11 of 11 smoke tests pass on the mock chain). **Live:** the testnet server answers `canRegister: true` for an unregistered demo name. Not verified: the buttons were not seen in a browser; I did not register a name on the live server.

Counts now: server 205, web 97 (+11 opt-in smoke tests), library 74, SDK 4, storefront 8, Foundry 49 (not rerun).

### 10g. "Reported in the real world" on the landing page

Three reports with working links to the originals, added at the developer's request. Each figure was read from the source on 2026-11-06, not taken from a search summary (the summaries disagreed with each other in places): the FBI's 2025 IC3 Annual Report (BEC losses $3,046,598,558 from 24,768 complaints, $2.77B in 2024, second after investment fraud; the report's own definition of BEC), the AFP 2025 Payments Fraud and Control Survey key highlights (79% of organizations attempted or actual payments fraud in 2024, BEC the top route at 63%, invoice fraud 24% from 14%, 22% recovered 75% or more of lost funds against 41% a year earlier) and Cointelegraph's report of the 49,999,950 USDT address-poisoning loss (published 20 December 2025; no transaction hash in the article). The two PDFs could not be read by the web fetcher and were read by extracting their text locally. All three links answered HTTP 200.

Honest framing: each card carries a limit of its source (reported complaints only; a survey summary, not the members-only report; a news report with no hash), the section says the figures are the publishers' and not independently verified, and it states what Truce does not stop (a compromised merchant site or signing wallet, an address copied wrongly outside Truce, a dishonest invoice paid to the right wallet). 7 tests check the https links, new-tab safety, publisher hosts, the printed figures and the absence of over-claim words. Not verified: the section was not seen in a browser; the links are checked only to answer 200 and will drift if the publishers move them. Web tests now 106 (+11 opt-in smoke).
