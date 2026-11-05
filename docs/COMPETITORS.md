# Competitors and prior art (snapshot 2026-11-05, about 22:20 IST)

Rerun the live scan before submitting: `node tools/competitor-radar.js --pages 6 --since 2026-11-03T00:00:00Z --deep`.
It matches keywords in verified source, so a miss is not proof. Other teams will deploy more by Nov 7. We read public contracts only to assess overlap and must **not copy their code**.

## Other entries on Whitechain Sepolia (verified contracts)
| Entry (explorer address) | What it does | Overlap |
|---|---|---|
| GraphPayCheckout `0x4fD68FB630711Ef592F24c2441eA23B270C1e442` | Permit2 pull payments, refunds, subscriptions with renewals, disputes | Heavy (refunds, scheduled pulls) |
| PaymentRouter `0x9f38D33010345DCd62e26640b539263FA139026E` + MerchantRegistry `0xe063C2fB8f80c20fF699f9f211bE300F58781f68` | Merchant-signed EIP-712 orders, relayer-gated gasless `payOrder`, capped refunds, operator-run merchant registry with "verified" badge and ENS names | Heavy. Booth: probably another team's entry, not a Whitechain reference; do not build on it |
| Checkout `0xa4eBC27F8ba275d765DE0aECa7Fa1C09204dEeb6` | On-chain receipts and capped refunds for "Till" orders, invoice-bound nonce | Medium |
| PullStub `0x51e2E2A530c9dabe6147D55F9bb7fcD47219325d` | EIP-3009 pull; its comment says Phase 2 "MerchantPay" will add an invoice-bound nonce | Medium (same trick planned) |
| ZowallGate `0x1fCb96e5e1a092BAB2376517036113Beb3Cc9c5a` (and 0x2Ced…1F84d, 0xA141…Ca16) | Procure-to-pay: purchase orders, receipt attestations, vendor-signed invoices, World ID attestations | Medium (vendor-signed invoice in procurement) |
| KhataRegistry `0x5D81284bDD6f691e45e7Aa35A83900B2B05177e8`, KhataFactory `0x73c026Fff2515AC3319EaC1400707750cff1E22a`, KhataNote `0x1eBBEE960c923CB49D07124aE15289f32ED5A659` | India GST e-invoice binding (RSA token check, attesters) and a USDT note per bound invoice | Different market and mechanism |
| InvoiceRegistry `0x37645b05895b66E4Ed4a4578D3Ed1A091E9ab209`, ReceivableFinance `0x3025FDea4Aa3A96deC46451b7Eec2e83188307B6` | Invoice financing (backend verifier role) | Tokenize track, not ours |
| OctaneRelay `0xc5DC3334636e5d053f0AC383722af4C05Db2a4Bf`, DeliveryCheckout `0xF2eeBe4d4B7D54ac85932AbaEE9883Edf8F4f19c` | Relay and delivery checkout (not read in depth) | Unknown |
**What none of the ones we read does:** verify the merchant against its **own domain** (`/.well-known`). Each trusts an operator registry, a backend role or an attester. That is our single clearest differentiator. The radar flags "domain/DNS verification" if someone else adds it.

## Prior art outside the event
- **ERC-8342 Verifiable Invoice Commitment (draft, 2026-04-26):** EIP-712 invoice schema + registrar binding invoice metadata to payments for auditors; no merchant verification, relayer or refunds. https://raw.githubusercontent.com/ethereum/ERCs/refs/pull/1890/head/ERCS/erc-8342.md
- **Instealth** (ETHGlobal Superhack 2024): stealth invoice settlement in EURC, EAS Merkle root for tax-amount proof; no signed invoices, EIP-3009 or scheduling found in its code (repo: 23 commits, no licence, no tests). It sends the stealth meta-address inside the invoice email.
- **SpectrePay** (Chainlink hackathon): stealth invoicing UI with mock data; contracts not in the public repo.
- **Request Network / Request Finance:** crypto invoicing; separate hosted payment page and ENS display for payees; pull-style payments needing approval each time; CSV export to accounting tools.
- **BIP-353 / Lightning Address:** domain-bound payment instructions in Bitcoin (DNSSEC or `.well-known`): the concept of domain-bound payees is not new; applying it to signed EVM stablecoin invoices is.
- **Others:** ECOSIRE Odoo USDT module, Paystand dynamic discounting (2022), Centrifuge, MonetaGo, FactorFi, Invoicify, x402 (deferred scheme), FluxA mandates, eco.com EIP-3009 explainers, EIP-7702 pull payments.

## Originality verdict (honest)
- **Conditional pass.** It passes as a differentiated *angle* (permissionless payee authentication before payment, enforced on chain), not as a differentiated *feature list*: merchant-signed orders, gasless pay, capped refunds, invoice-bound nonce and scheduled pulls each exist somewhere.
- **One-sentence difference:** "Buyers verify the payee against the merchant's own domain before paying; every other entry we found trusts an operator, a backend or an attester."
- **Risks:** a rival adds domain verification before Nov 7; a lookalike or already-compromised domain defeats the check; concurrent entries we have not seen. Pitch the attack demo first and say what we reuse.
- Our GitHub keyword searches returned zero hits, but GitHub repository search only matches names and descriptions: weak evidence.
