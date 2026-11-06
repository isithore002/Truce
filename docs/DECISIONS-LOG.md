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

## Additions authorised (2026-11-06, later)
The developer asked for five additions (and later a sixth, and a seventh found in the first browser click-through) to raise the demo's impact for the Whitechain Operate track, each tied to its stated asks (a drop-in piece a separate demo app adds, refunds, renewals, merchant and customer views):
1. Merchant dashboard refreshes every 4 s and flashes rows whose status changed.
2. The receipt shows the network fee and who paid it, read from the explorer for that transaction.
3. A visible storefront demo app (`examples/merchant-demo/shop.ts`) whose Truce integration is 9 lines.
4. A refund panel in the invoice drawer, backed by `POST /api/invoices/:hash/refund` (the payout wallet signs, the relayer sends, the contract pays only the original payer, capped).
5. An optional monthly series: N separate invoices, each signed and paid on its own. Worded as a series of invoices, not a subscription or a recurring charge.
6. An ERP-style reading of the architecture (`docs/design/G-ERP-STYLE-VIEW.md`), a CSV that shows refunds (`refunded`, `net_received`), and a ledger export with one row per money movement. Worded as an export for an accountant, never as an ERP integration.
7. A "Check my domain" button on the Setup page (`GET /api/domain-check`): reads the merchant's `/.well-known/truce.json` fresh, with the same SSRF-guarded fetch the buyer's check uses, and says in plain words whether it lists the wallets they are about to use. Added because the Setup page marked "publish the file" as done after a click on Download, and offered only a `curl` command to check it; the merchant first learned of a missing file after signing an invoice. In demo mode only, a fictional `.example` name (which has no website to publish on) can be registered from the Setup page with one click (`POST /api/demo-domains`); the server builds the file from the connected wallet, never replaces a built-in example, and never lets another wallet take a registered name. A real domain always publishes its own file: the domain is the trust anchor, so Truce does not host it.
This reverses the earlier decision to keep the refund UI out. **No existing feature was removed to pay for these** (the change rule normally requires that): this is a written exception made by the developer. If time runs short the cut order is the series, the storefront and the fee line first, then the Soul badge.

## Build choices
- 2026-11-06, web: the `b/web-frontend` app (mock adapter, /setup, /demo, key pinning, pay gate tests) replaces the first `apps/web` on `main`; it was replayed on top of `main` in small commits, keeps `main`'s Vite 8 / React 19 / TS 7, signs only through `@truce/invoice-lib`, and maps the real `apps/server` responses in `src/lib/api/client.ts`.
- 2026-11-06, web: visual style changed to the "teal treasury" look the user picked from a reference template (palette and font only; no code or brand copied). Details in `apps/web/TEMPLATE-MAP.md`.
