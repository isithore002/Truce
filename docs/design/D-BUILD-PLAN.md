# D. Build plan

Basis: one developer, written 2026-11-05 about 23:50 IST, deadline **Sat 2026-11-07 09:00 IST** (about 33 hours). Sleep 6 hours leaves about **27 awake hours**. All estimates assume an AI coding assistant and are my estimates, not measurements.
**Headline: the MUST scope alone is about 25 hours, leaving about 2 hours of slack. SHOULD items are opportunistic, not planned.**

## 1. Work breakdown structure
Priority: M = Must, S = Should, C = Could. "AC" = acceptance criteria.

### E1 Foundations
| ID | Task | P | Hours | Depends on | Acceptance criteria |
|---|---|---|---|---|---|
| T01 | Fund two throwaway wallets (faucet, YetiTrade) and run `gate1.mjs --cancel` live | M | 1.5 | none | `gate1-result.json` all PASS, tx links saved; cancel result recorded. If the signed redemption fails: switch to the permit fallback (R1) |
| T02 | Contract workspace: solc 0.8.30, evm prague, OpenZeppelin v5 submodule, remappings, ABI export script | M | 0.5 | none | `forge build` passes; ABI export writes `contracts/abi/InvoiceSettler.json`; commit under 1000 lines |

### E2 Contract
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T03 | `InvoiceSettler.settle`, EIP-712 digest, errors, events | M | 2.0 | T02 | `hashInvoice` equals the golden vector; settle pays exactly the signed payout; reverts on bad signature |
| T04 | Negative and edge tests: swapped payout, tampered amount, wrong signer, expired, settled twice, payer lock, non-allowlisted token, empty balance, fee-on-transfer token | M | 1.5 | T03 | All pass against a mock EIP-3009 token; swapped payout test named and asserted |
| T05 | `refund` with cap, original payer only, tests | S | 1.0 | T04 | cap and double-refund tests pass; contract balance zero after calls |
| T06 | Golden-vector Foundry test and a fuzz test over amounts and timestamps | M | 0.5 | T03, T08 | TS and Solidity hashes identical for all vectors |
| T07 | Deploy script, deploy to 1874, verify on Blockscout, record `deployments/whitechain-sepolia.json` | M | 0.5 | T04, T01 | Verified contract page on the explorer; address in the repo |

### E3 Library (`packages/invoice-lib`)
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T08 | Types, canonical memo hash, invoice hash, sign, recover; first golden vectors | M | 1.0 | T02 | vitest passes; vectors file committed |
| T09 | Verify pipeline: ten checks, injected domain-file resolver, plain-language messages | M | 1.5 | T08 | five scenarios give the right PASS/FAIL and check ids (PASS, swapped payout, tampered amount, wrong signer, expired) |
| T10 | Authorization builders: `ReceiveWithAuthorization` and `CancelAuthorization` typed data, signature split | M | 0.5 | T08 | typed data matches the token domain (name "Tether USD", version "1", chain 1874) |

### E4 Chain module (`apps/server/src/chain`)
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T11 | viem module: simulate then settle, basic WBT budget and per-IP rate limit, error mapping | M | 1.5 | T07, T10 | `scripts/e2e-settle` settles one real invoice; a failing simulation sends nothing |
| T11b | Mock module with the same interface | M | 0.5 | T10 | UI runs with `CHAIN_MODE=mock` |
| T12 | Health check (balance, authorization state, blocked, expiring) and relayed cancel | S | 1.0 | T11 | AT_RISK on a drained wallet; cancel marks the authorization used |
| T13 | Scheduler for due-date settles, retries until `validBefore` | S | 1.0 | T11 | a due-date invoice settles at its due time in a test |

### E5 Server (`apps/server/src/api`)
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T14 | Fastify skeleton, Store interface and JSON store, create, get, list routes, zod schemas, error format | M | 1.25 | T09 | routes covered by tests; atomic writes |
| T15 | Domain fetch with SSRF guard and cache, example-domain fixtures, `GET/POST /api/verify` | M | 1.0 | T09, T14 | SSRF tests (private IP, redirect, size, timeout) pass; fixtures serve the EXAMPLE merchant |
| T16 | `authorize` (mode now) with settle, status updates, audit events, CSV export, `/healthz`, `/api/config` | M | 1.0 | T11, T14 | pay-now works end to end against testnet; CSV columns correct |

### E6 Web (`apps/web`)
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T17 | App shell, routes, wallet connect, add chain 1874, EXAMPLE DATA banner | M | 0.75 | T14 | wallet connects on 1874 |
| T18 | Buyer page: invoice, checklist PASS/FAIL, sign, pay, receipt with explorer link | M | 2.0 | T15, T16, T17 | swapped payout shows FAIL and disables Pay; honest invoice pays with one signature |
| T19 | Public verify page (reuses the checklist component) | M | 0.5 | T15 | no wallet needed; shows on-chain status |
| T20 | Merchant page: setup (generate `truce.json`), create invoice, dashboard, CSV button | M | 1.75 | T14, T17 | invoice created and listed with status and tx links |

### E7 SDK and demo app
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T21 | SDK `createInvoice` | M | 0.5 | T14 | returns link and hash |
| T22 | Example merchant app using the SDK | M | 0.5 | T21 | integration code is 20 lines or fewer (counted and stated in the README) |

### E8 Differentiator and Should features
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T23 | Key pinning: store pins, warn on changed signing or payout wallet | M | 1.0 | T18 | changed-wallet scenario shows the warning |
| T24 | Due-date mode: UI toggle, `mode due` authorization, scheduler wiring | S | 1.5 | T13, T18 | scheduled invoice settles at its due time in the demo |
| T25 | Health UI: AT_RISK and FAILED states with reasons, buyer cancel button | S | 1.0 | T12, T24 | dashboard flips to AT RISK when the wallet is drained |

### E9 Docs and submission
| ID | Task | P | Hours | Depends on | AC |
|---|---|---|---|---|---|
| T26 | README (setup, architecture, limitations, why onchain), explorer links | M | 1.0 | T07 | a stranger can run it; claims are tested or marked not tested |
| T27 | `WHITECHAIN_FEEDBACK.md` finalised | M | 0.3 | T01 | worked, stuck, docs lacked |
| T28 | Demo rehearsal and recording (2 to 4 minutes) | M | 1.5 | T18 | video recorded, with a spare take |
| T29 | Radar rerun, `npm run check:commits`, submit with Whitechain selected | M | 0.5 | all | submitted before 09:00 IST |
| T30 | Optional public hosting | C | 1.0 | T20 | live URL |
| T31 | Mocked Soul badge (exact wording) | C | 0.75 | T18 | badge text matches `../WB-SOUL.md` |

**Totals:** Must **25.05 h** (T01, T02, T03, T04, T06, T07, T08, T09, T10, T11, T11b, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T26, T27, T28, T29). Should **5.5 h** (T05, T12, T13, T24, T25). Could 1.75 h.
Awake budget about 27.2 h, so slack is about 2.2 h (8%).

## 2. Critical path and parallel work
- **Dependency chain (longest):** T02 -> T03 -> T04 -> T07 -> T11 -> T16 -> T18 -> T23 -> T28 -> T29, about 13 hours of work. With one developer the schedule is **effort-bound**, so order matters more than the path.
- **Interleave while waiting:** faucet cooldowns and contract verification propagation (do T08, T09, T10 meanwhile); test runs and compiles (draft README and feedback text).
- **AI assistant parallelism:** documentation drafts (T26, T27) and fixtures can be prepared by a second assistant session while the main session codes. They must not touch the same files.

## 3. Schedule working backward from the deadline (IST)
| Phase | Window | Tasks | Ends at |
|---|---|---|---|
| P0 | Nov 5 23:50 to Nov 6 01:20 | T01, T02 | Gate 1 live result |
| P1 | Nov 6 01:20 to 07:20 | T03, T04, T08, T10, T06, T07 | **C1 safety net** (verified contract, one real settlement via script) |
| Sleep | 07:20 to 13:20 | | |
| P2 | 13:20 to 23:20 | T09, T11, T11b, T14, T15, T16, T17, T18, T19 | **C2** browser flow, swapped payout FAIL, verify page |
| P3 | 23:20 to Nov 7 03:05 | T20, T21, T22, T23 | **C3** dashboard, CSV, SDK, demo app; **C4 feature freeze** after pinning |
| P4 | 03:05 to 06:25 | T26, T27, T28, T29 | **C5** README, feedback, video, submit |
| Buffer | 06:25 to 09:00 | spare time; SHOULD items only here or earlier if ahead | submit by 08:00 |
SHOULD items (T05, T12, T13, T24, T25) start only if a checkpoint is reached early, in this order: T05 (refund contract and tests), T13 + T24 (due-date mode), T12 + T25 (health and cancel). The clock times in `../WORKFLOW.md` are earlier than this table; **this table is the realistic one** and `WORKFLOW.md` is updated to match.

## 4. Milestones and Go/No-Go
| Milestone | Done when |
|---|---|
| C1 | Contract verified on 1874; tests green; one real USDT settlement with explorer link; swapped payout reverts; tagged `c1` |
| C2 | Browser: PASS then pay now works; swapped payout shows FAIL and Pay is disabled; verify page works; tagged `c2` |
| C3 | Merchant creates invoice in the UI; dashboard shows status; CSV downloads; SDK demo app runs; tagged `c3` |
| C4 | Pinning works; feature freeze; only fixes after this |
| C5 | README, feedback, video done; radar and commit check clean; submitted |
**50% Go/No-Go: Nov 6 about 16:25** (half of the 33 hours). Go means C1 is tagged **and** T09, T14, T15 are done. No-Go (either missing) triggers: drop all SHOULD and COULD items, reduce the web app to buyer page plus verify page (merchant creates invoices by script), keep CSV as a script output, keep the swapped-payout demo.

## 5. Risk register
| # | Risk | L | I | Mitigation | Fallback / what is cut first |
|---|---|---|---|---|---|
| R1 | Signed redemption fails on the track USDT | Low-Med | High | Gate 1 first (T01), domain already reconstructed | Permit variant: contract calls `permit` then `transferFrom`; or testnet USDC.e if it has EIP-3009 (UNVERIFIED) |
| R2 | MUST uses about 25 of 27 hours | High | High | Vertical slices, tags, clock gates, small commits | Cut order: Soul badge, hosting, CSV styling, due-date mode, pinning; never the swapped-payout demo |
| R3 | Explorer verification fails | Med | Med | Pin solc 0.8.30 and evm prague exactly, use the documented `forge verify-contract` flags | Verify via the explorer UI with standard JSON input |
| R4 | Not enough test WBT (faucet 0.5 or 2 a day, GitHub age) | Med | Med | Claim on day one; budget under 0.01 WBT per settle | Second GitHub account; ask the booth |
| R5 | No test USDT (YetiTrade depth) | Low-Med | Med | Swap early (T01) | Ask the booth or other teams |
| R6 | A rival adds domain verification | Low-Med | Med | Rerun radar on Nov 6 and Nov 7; pitch also stresses on-chain payout enforcement | Lean on due-date and health-check features |
| R7 | RPC rate limit or outage | Low | Med | Batch reads, Ankr backup | `CHAIN_MODE=mock` and pre-recorded segments |
| R8 | Wallet friction (adding chain 1874, typed-data quirks) | Med | Med | Use viem's chain parameters for `wallet_addEthereumChain`; Rabby as backup | Script-signed authorization with a throwaway key for the recording |
| R9 | Commit-size rule broken by a lockfile | Med | Med | Pre-commit hook; install dependencies in small batches | Split the install across commits |
| R10 | Solo fatigue causes bugs in the final demo | High | High | Fixed 6-hour sleep, rehearse once, record in segments | Pre-recorded fallback video |
| R11 | SSRF guard bug | Low | Med | Dedicated tests; fixtures used in the demo | Disable real-domain fetch for the demo |
| R12 | Unverified assumptions (signed cancel, buyer ERC-1271) wrong | Med | Low | Both are Should/Could and flagged UNVERIFIED | Remove cancel from the demo |
| R13 | Scheduler flaky during demo | Med | Med | Short due date; manual "collect now" control | Show scheduled state and settle by button |

## 6. Testing strategy
- **Contract (Foundry):** unit tests with a mock EIP-3009 token; fuzz over amount, `validAfter`, `validBefore`, expiry; invariant tests (each hash settles at most once; `refunded <= amount`; contract token balance zero); golden-vector test shared with TypeScript; one **fork test** against the real track USDT on Sepolia (needs a funded key and respects the 50 req/s limit).
- **Library (vitest):** hash and signature round trips; every changed field breaks verification; the five scenarios; domain-file mismatch cases; memo hash canonicalisation.
- **Server (vitest + Fastify inject):** schema validation; error mapping; SSRF cases (private IPs, redirects, oversize, slow response, non-https); store atomicity; CSV columns.
- **End to end:** `scripts/e2e-settle` creates, signs, authorizes, settles on testnet and asserts on-chain state; rerun at every checkpoint.
- **Demo script run:** the shot list in `E-SUBMISSION.md` is rehearsed twice end to end before recording.
- **Test data plan:** fictional Northlight Design Studio and Beta Labs in `fixtures/`; throwaway test keys generated locally, never committed; the published golden-vector key is a well-known public development key (Anvil default account 0) that never holds funds; example domain files served locally; amounts 1,250 USDT for the demo and small amounts (0.01 USDT) for repeated runs.

## 7. Definition of Done (whole project)
- All MUST items pass their acceptance criteria and the demo path runs from a clean clone using the README.
- Contract verified on Whitechain Sepolia with tests green; at least one real USDT settlement and one swapped-payout revert with explorer links.
- README has setup, architecture, limitations and the "why onchain" line; `WHITECHAIN_FEEDBACK.md` complete; `docs/AI-USE.md` accurate.
- 2 to 4 minute video shows each party; example data labelled; limits stated.
- `npm run check:commits` reports 0 commits over 1000 inserted or deleted lines; no secrets in the history.
- Submitted before 09:00 IST on Nov 7 with Whitechain selected.
