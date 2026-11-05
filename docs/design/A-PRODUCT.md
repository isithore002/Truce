# A. Product definition

## 1. Problem statement, goals, non-goals
**Problem.** Invoices are paid to whatever payee details arrive with them. Attackers change those details ("our bank details changed") or poison address histories, and the buyer cannot tell. Reported US business email compromise losses were about $3.05B in 2025 (FBI IC3 via a secondary source); address poisoning was over 10% of wallet drains in 2025. Banks in the EU now check payee names (Verification of Payee, since 2025-10-09); stablecoin invoices have no comparable check that we found.

**Goals**
- G1 A buyer can verify, before paying, that the payout wallet on an invoice belongs to the merchant that owns the domain on the invoice.
- G2 The contract refuses to pay anyone other than the payout wallet the merchant signed, so no app, server or relayer can redirect funds.
- G3 Payment needs one signature and no gas from the buyer.
- G4 Each invoice settles once, with a public, explorer-linked record and an accountant CSV.
- G5 (SHOULD) The buyer can authorize collection on the due date, and the merchant sees early whether collection is at risk.
- G6 Setup for a merchant is one JSON file on its own domain and an existing wallet.

**Non-goals**
- N1 Proving a sale is real (sockpuppet fraud), dispute resolution, tax or accounting compliance.
- N2 Stealth or private recipients; confidential amounts.
- N3 Locking funds in escrow; a guarantee of payment.
- N4 ERP integration, subscriptions, multi-chain, mobile apps, fiat on or off ramps.
- N5 Mainnet transactions, real KYC or KYB, real users or adoption claims.
- N6 Webhooks (roadmap).

## 2. Personas and key user journeys
| Persona | Description | Wants |
|---|---|---|
| **Priya, merchant** | Owner of a five-person design agency billing crypto-native clients on 30-day terms. Fictional in the demo. | To get paid on time, to stop spoofed "new bank details" emails hurting clients, minimal setup |
| **Daniel, buyer** | Ops lead at Beta Labs paying vendors in USDT. Fictional in the demo. | To be sure the wallet is the vendor's, one click payment, a record for the accountant |
| **Sam, verifier** | Anyone: an auditor, a colleague, a judge. | To check an invoice and its status without an account or wallet |

**Journeys**
- **J1 Merchant onboarding:** connect wallet -> download the generated `truce.json` -> upload it to `https://<domain>/.well-known/` -> create an invoice -> copy the link.
- **J2 Buyer pays now:** open link -> see PASS and the checklist -> connect wallet -> sign once -> see receipt and explorer link.
- **J3 Attack (hero):** the payout in the emailed copy is swapped -> the app shows FAIL and names the failing checks; a direct on-chain `settle` with the swapped payout reverts.
- **J4 Pay on due date (SHOULD):** buyer signs once with `validAfter = dueDate` -> dashboard shows scheduled -> health check warns "at risk" if the balance is low -> collection runs at the due time or shows FAILED with a reason.
- **J5 Verify publicly:** paste a link on the verify page -> PASS or FAIL plus on-chain status.
- **J6 Merchant reconciles:** dashboard shows statuses and transaction links -> download the CSV.

## 3. Functional requirements (MoSCoW)
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Merchant creates an EIP-712 signed invoice (amount, payout, token, due date, expiry, optional payer lock, memo hash) | Must |
| FR-02 | Setup page generates `truce.json` from the connected wallet and a payout address | Must |
| FR-03 | Buyer page shows the invoice and a PASS/FAIL checklist (signature, domain file, payout listed, domain hash, chain and token, expiry, memo hash, payer) | Must |
| FR-04 | Buyer pays now with one signature; the relayer pays gas | Must |
| FR-05 | `InvoiceSettler` verifies the merchant signature and pays only the signed payout; settles each invoice once; rejects non-allowlisted tokens and expired invoices | Must |
| FR-06 | Swapped payout is rejected in the app and reverted on chain | Must |
| FR-07 | Public verify page (no wallet) shows PASS/FAIL and on-chain status | Must |
| FR-08 | Merchant dashboard lists invoices with status and explorer links | Must |
| FR-09 | CSV export (invoice id, names, amount, due date, status, tx link, paid at) | Must |
| FR-10 | SDK `createInvoice` and an example merchant app that integrates in about 20 lines | Must |
| FR-11 | Key pinning: after a first payment, warn if a domain's signing or payout wallet changes | Must |
| FR-12 | Every page that uses fictional data shows an EXAMPLE DATA banner | Must |
| FR-20 | Pay on the due date: authorization valid from `dueDate`; scheduler submits at the due time | Should |
| FR-21 | Health check before the due date (balance, authorization unused or cancelled, blocked, expiring) with AT_RISK and FAILED states and reasons | Should |
| FR-22 | Buyer cancels a scheduled authorization (gasless, signed `cancelAuthorization`) | Should |
| FR-23 | Capped refund to the original payer in the contract with tests (script-driven, no UI) | Should |
| FR-30 | Mocked Soul badge worded "Individual KYC-verified on WhiteBIT (demo data, mocked)" | Could |
| FR-31 | Public deployment of web and server | Could |
| FR-90 | Webhooks, stealth recipients, mainnet, disputes, subscriptions, real Soul reads | Won't |

## 4. Non-functional requirements
| Area | Requirement |
|---|---|
| Security | Contract never holds funds beyond one transaction; no admin can move funds (owner can only pause new settlements); relayer cannot change the payee; SSRF-safe domain fetch; no keys in the repo; throwaway keys only |
| Privacy | Invoice details stay off chain (hash only). Merchant, payer, payout and amount are public on chain. Stated openly |
| Latency | PASS/FAIL within 2 seconds on a cached domain file; settle confirmed in about 1 to 5 seconds on 1-second blocks (soft confirmation) |
| Cost | Relayer cost per settle about 0.0006 to 0.001 WBT (estimate, UNVERIFIED); a 1 WBT budget covers the demo many times over |
| Reliability | Idempotent settle (second attempt reverts cleanly); relayer simulates before sending; if the relayer is down the buyer can submit the signed call with their own WBT; `CHAIN_MODE=mock` keeps the UI usable |
| Usability | Plain-language results ("The payout wallet is not listed on northlight-design.example"); buyer never sees a gas prompt |
| Maintainability | Golden vectors keep TypeScript and Solidity hashes identical; no commit over 1000 inserted or deleted lines |

## 5. Success metrics and demo success criteria
| Metric | Target |
|---|---|
| M1 Real USDT settlements on Whitechain Sepolia with explorer links | at least 1 (target 3) |
| M2 Swapped-payout attempts rejected in app and on chain | 100% in the demo |
| M3 Verify scenarios behaving correctly (PASS, swapped payout, tampered amount, wrong signer, expired) | 5 of 5 |
| M4 Foundry tests passing (including fuzz and invariants) | all, at least 20 |
| M5 Lines to integrate the SDK in the example app | 20 or fewer |
| M6 Demo length | 3 to 4 minutes, within ETHGlobal's 2 to 4 minute rule |
| M7 Commits over the 1000-line limit | 0 |

**Demo success criteria (all must be visible on screen):** EXAMPLE DATA banner; the swapped payout FAIL; the same swapped payout reverting on chain; an honest PASS then a single-signature payment; the explorer transaction; the settled status on the public verify page; the CSV row; the limits stated aloud.
