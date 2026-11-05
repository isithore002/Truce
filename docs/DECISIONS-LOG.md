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
