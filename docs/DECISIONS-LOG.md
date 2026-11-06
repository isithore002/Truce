# Decisions log: how we got here (read this before re-opening any decision)

**Project name: Truce.** Earlier working names (DueNote, then SealedInvoice) appear below as history; the project was renamed to Truce on 2026-11-05.
Dates are 2026-11-05 unless noted. "Evidence" names the file or source that backs the call.

## Path
1. **Started from ERP gaps research** (reporting, spreadsheets, reconciliation, adoption). Too generic to build a hackathon idea on. Pivoted to the Whitechain **Operate** track (invoices, checkout, subscriptions, refunds in USDT).
2. **Ideas tested against prior art and dropped:**
   | Idea | Why dropped |
   |---|---|
   | ERP-to-crypto payment connector | Already sold: ECOSIRE Odoo USDT module, Request Finance CSV/QuickBooks exports, Odoo Crypto Payment Sync |
   | Invoice registry to stop double financing | Centrifuge (2018), MonetaGo, FactorFi, Invoicify exist; shared registries need every financier (we.trade, Marco Polo, TradeLens, Contour all shut down); sockpuppet fraud (two wallets faking a sale) cannot be detected |
   | Three-way match / escrow payments | Whitechain says it will not place standalone escrow; heavy overlap |
   | Dynamic discounting | Paystand shipped it on Ethereum in 2022 |
   | Construction retention release | Heavily researched (SMTSEC, RETPAY, BuildLink), securities-law risk when tokenized |
   | Payer reputation from payment history | ChainScore exists; no evidence it predicts default; sybil and network-effect problems |
   | **DueNote** (buyer signs once, invoice collects itself on the due date) | Direct debit mandates already automate pulls; funds are not locked; moderate originality; became a feature (due-date collection), not the product |
   | **SealedInvoice v1** (stealth recipient addresses + signed invoices) | Instealth (ETHGlobal 2024) already did stealth invoicing; key backup burden; sweeping funds re-links them; amounts stay public; privacy demand evidenced only by project claims; too heavy for 36 hours. Archived in `archive/SPEC-v1-stealth-SUPERSEDED.md` |
3. **Chose SealedInvoice v2.** The one angle no entry we found covers: **buyers verify the payee against the merchant's own domain before paying; the contract then pays only the payout wallet the merchant signed.** Every other entry trusts an operator registry, a backend role or an attester.

## Facts that forced changes
- Mainnet has no official USDT yet; USDC.e (Circle FiatTokenV2_2) has EIP-3009 per its verified ABI. Hackathon demo is testnet-only (booth: anything beyond mainnet reads costs real WBT).
- A merchant-signed, gasless, refundable checkout already exists on the testnet (`PaymentRouter`, probably another team) and several more Operate-style entries appeared the same day (`COMPETITORS.md`). Feature parity is not a differentiator; the domain-verified payee is.
- WB Soul exists on mainnet only, reflects personal KYC, is controlled by one owner address. Decision: mocked, labelled badge, stretch only (`WB-SOUL.md`).
- Booth feedback (opinion, not data): due-date collection fits B2B invoices with terms; add a pre-due balance check and a clear Failed state; show the swapped-payout FAIL; use a labelled made-up merchant (`BOOTH-NOTES.md`).

## Scope swaps made under the change rule ("nothing added unless something of equal size is removed")
- Stealth addresses: roadmap (removed).
- Verify page + key pinning: SHOULD to MUST (it is the differentiator).
- Due-date collection: MUST-ish idea to STRETCH to SHOULD (booth fit for B2B) with a health check; **refund UI removed** to pay for it (refunds stay in the contract and tests).
- Soul badge: stretch, mocked.

## Claims we agreed NOT to make
First/only/world-first; "guaranteed payment" or "locked funds"; "needs Whitechain" (say: uses the track USDT, EIP-3009 and a WBT relayer; the design is portable); "verified business" (Soul is personal KYC); ERP integration (we only export a CSV); real users or adoption numbers; any mainnet test we did not run.

## Team size (2026-11-05 23:21 IST): one developer
The two-developer split (chain side / product side) was dropped; one person now builds everything with 33.6 hours left.
- Kept: the module boundaries (contracts, library, chain module, api, web) as code organisation, and `CHAIN_MODE=mock`.
- Replaced: ownership and PR rules with vertical slices, checkpoints C1 to C5 with tags, and clock-based cut gates (`WORKFLOW.md`).
- Cut (removals under the change rule): webhooks, database (JSON-file store), Soul badge unless more than 2 hours are spare after C4.
- Built first as a safety net: a script that settles one real USDT invoice (C1), so a working submission exists early.

## Full scope authorised (2026-11-06)
The developer asked for an autonomous run covering MUST + SHOULD + STRETCH (`docs/prompts/AUTONOMOUS-RUN.md`): merchant page, SDK and demo app, key pinning, refund (contract + tests, redeploy), due-date mode, health check and cancel, mocked Soul badge, docs, audit.
This is the written exception to the scope-change rule. Refund UI stays out (contract + tests only). Hosting (T30) stays out. Progress is logged in `docs/AUTONOMOUS-LOG.md`.

## Build choices
- 2026-11-06, web: the `b/web-frontend` app (mock adapter, /setup, /demo, key pinning, pay gate tests) replaces the first `apps/web` on `main`; it was replayed on top of `main` in small commits, keeps `main`'s Vite 8 / React 19 / TS 7, signs only through `@truce/invoice-lib`, and maps the real `apps/server` responses in `src/lib/api/client.ts`.
- 2026-11-06, web: visual style changed to the "teal treasury" look the user picked from a reference template (palette and font only; no code or brand copied). Details in `apps/web/TEMPLATE-MAP.md`.
