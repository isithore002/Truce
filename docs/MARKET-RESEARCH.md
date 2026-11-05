# Truce: market research, adoption plan, and how to strengthen the idea
Date: 2026-11-05. Evidence grade: A = rule or primary-ish, B = credible secondary, C = vendor / self-reported / anecdote.
Nothing here measures willingness to pay. That has to come from the conversations in section 6.

## 1. What the booth reaction is worth
"New to us, sounds good" is interest from a sponsor who wants entries. It is not demand. Treat it as a door to ask for
introductions (section 7), not as validation.

## 2. Evidence table
| # | Finding | Source | Grade |
|---|---|---|---|
| 1 | Business email compromise: about $3.05B reported to the FBI in 2025 (24,768 complaints) | [Insurance Business](https://www.insurancebusinessmag.com/us/news/cyber/business-email-fraud-drives-bulk-of-us-cybercrime-losses-analysis-590687.aspx) relaying IC3; FBI report not opened | B |
| 2 | EU bank rails now check payee name against IBAN (Verification of Payee, mandatory from 9 Oct 2025, euro SEPA). The payer decides what to do on a mismatch. No post-launch fraud numbers found. | [Deutsche Bank](https://corporates.db.com/in-focus/Focus-topics/instant-payments-vop), [Sepamail](https://www.sepamail.eu/?p=2342) | A for the rule, none for its effect |
| 3 | A paid market for payee verification exists in fiat: Trustpair cites 400 to 550+ enterprise customers, quote-only pricing, SAP/Coupa integrations. One review says it is less accessible to small and mid-size firms. | [ERP Research](https://erpresearch.com/erp-add-ons/fraud-risk/trustpair), [Fintech Global](https://fintech.global/2026/04/28/coupa-expands-trustpair-tie-up-to-fight-vendor-fraud/) | C (vendor claims) |
| 4 | Crypto version of the same error: address poisoning was over 10% of wallet drains in 2025; one trader lost about $50M USDT in Dec 2025; an academic study counted 270M attempts, 17M victims, at least $83.8M lost. | [The Block](https://www.theblock.co/post/383423/crypto-trader-loses-50-million-in-address-poisoning-attack-offers-1-million-bounty-for-return), [Webacy](https://world.webacy.com/from-the-ctos-desk-september-2025) | B |
| 5 | B2B is the largest real stablecoin payment use: about $226B of about $390B in 2025 (~58%), up 733% year on year, but only about 0.02% of global payments. | [McKinsey](https://www.mckinsey.com/featured-insights/week-in-charts/stablecoins-find-their-niche), [Defiant](https://thedefiant.io/b2b-stablecoin-payments-grew-over-730-percent-yoy-in-2025) | B |
| 6 | Crypto-native invoicing has real users: Request Finance reported 1,700 to 1,900+ teams and $200M to $300M+ invoices paid (2022 to later). Customers are DeFi projects and DAOs. | [Request Finance](https://www.request.finance/post/celebrating-a-new-milestone-200m) | C (own posts, inconsistent snapshots) |
| 7 | Ukraine: USDT salaries are "fairly common" at IT firms (sponsored article); many withdraw to fiat quickly. Ukraine ranks 8th overall and 1st per capita on Chainalysis 2025 crypto adoption; first in stablecoin use relative to GDP per DL Research / Bybit (not Chainalysis). | [dev.ua](https://dev.ua/en/news/trustee-plus-1710933971), [Forklog](https://forklog.com/en/russia-and-ukraine-fall-in-chainalysis-cryptocurrency-adoption-rankings/) | C to B |
| 8 | UAE: commentary says USDT is a Foreign Payment Token approved for institutional B2B settlement; OTC desks start around $30K. Turkey: Tether CEO says USDT settles some trade (self-reported). China and small-business usage: nothing found. | [ARP Digital](https://www.arpdigital.io/en/resources/news-insights/dmcc-tether-commodity-settlement-stack), [Cryptorank](https://cryptorank.io/news/feed/4bd92-tether-ceo-sees-usdt-settling-trade-and-hedging-inflation-in-developing-markets) | C |
| 9 | Privacy demand is shown by projects, not studies: DAO and payroll privacy tools, Instealth, SpectrePay. No survey of what businesses would pay for. | [Chainlink hackathon entry](https://chain.link/hack-26/projects/veil-protocol), [Aleo](https://aleo.org/post/stablecoin-privacy/) | C |
| 10 | WhiteBIT itself has about 5.5M users; W Group (8 companies) reports 30 to 35M across all of them. No country split found. The "40M" in marketing is group-level. | [UNN](https://unn.ua/en/amp/from-new-york-to-riyadh-how-whitebit-scaled-ukrainian-web3-expertise-in-2025), [Lada.kz](https://www.lada.kz/kazakhstan-news/132340-whitebit-rasshiriaet-globalnoe-prisutstvie-litsenzii-vasp-v-khorvatii-italii-i-kazakhstane-otkryvaiut-novye-vozmozhnosti.html) | B/C |
| 11 | Prior art for domain-bound payees: BIP-353 (DNSSEC-validated payment instructions in DNS), Lightning Address (`.well-known`). On EVM, Request Network separates its payment page from the merchant site and shows ENS names for payees. | [BIP-353](https://bips.dev/353), [Request docs](https://docs.request.network/tools/secure-payments) | A/B |

## 3. What the evidence changes in the pitch
- **Lead with fraud, not privacy.** Fraud has numbers (rows 1, 3, 4). Privacy demand rests on project claims (row 9). Privacy stays as the second benefit.
- **Crypto-native version of the story is address poisoning (row 4).** Truce never asks anyone to type or copy an address: the payee is derived from the signed invoice and the merchant's domain key. This is the sharpest claim, and it is a design fact you can show.
- **Give credit.** Domain-bound payees exist in Bitcoin (row 11) and Request partly addresses spoofing. Say: "same idea as BIP-353 and Lightning Address, applied to signed invoices on stablecoin rails." Do not claim to have invented domain binding.
- **Be honest on size.** B2B stablecoin payments are about 0.02% of global payments (row 5). The real early market is small: crypto-native teams and a few corridors.
- **Fiat precedent as the "why now" line.** Banks now verify the payee (row 2) and companies pay for it (row 3). Stablecoin payments have no equivalent that I found. "I found none" is not "none exist."

## 4. Who the users are (ranked by evidence)
1. **Finance/ops people at crypto-native companies and DAOs who pay vendors.** They lose the money in a swap or poisoning, so they are the natural economic buyer of fraud prevention (fiat precedent: Trustpair sells to payers). Evidence: rows 3, 4, 6.
2. **Crypto-native agencies and freelancers who bill them.** They are the supply side and already invoice in stablecoins (row 6).
3. **Ukrainian IT firms and freelancers paid in USDT.** Fits WhiteBIT's origin; evidence is anecdotal and many cash out immediately (row 7).
4. **Whitepay-style merchant acquirers** as a channel, not a user (they already do QR/link invoices; plugin looked unmaintained).
5. **Cross-border SME trade (UAE, Turkey).** Plausible, unproven for small firms, compliance-heavy. Park it.

## 5. Adoption plan
Two-sided problem: the merchant must publish a file; the buyer must hold USDT on the chain.
- **Buyer-led pull.** Build a free "check this invoice" page. A buyer who wants safety asks each vendor to publish a key. One buyer brings 3 to 20 vendors; each vendor then reuses the file with every other buyer.
- **Five-minute merchant onboarding.** Generate the signing key in the browser, download the JSON, upload it to `/.well-known/`. No account, no custody. This is the single most important adoption lever and it is cheap to build.
- **Pilot set (first 10):** 3 crypto-native agencies/freelancers, 3 DAO or crypto-company finance people, 2 Whitepay-style merchants, 2 Ukrainian IT firms. Find them at this event and at Devcon 8 in Mumbai (dates are from a secondary calendar, unverified).
- **Whitechain dependency to state plainly:** WhiteBIT is about 5.5M users, and the track-USDT route for exchange users is unconfirmed (only WBT withdrawals were described). Buyers will start by swapping on YetiTrade. So do not promise Whitechain-delivered users. Launch the pilot among parties who already agree to use it, and the design ports to other chains with signed-transfer tokens.
- **Money.** Do not state a price. Hypotheses to test: free verify and free merchant setup; paid sponsored-gas plans, approval workflows, audit packages. Reference points: Bitwage charges 2% for stablecoin payout; Trustpair is quote-only.
- **Metrics:** merchants with a published file; invoices paid through the verified flow; time to first verified invoice; repeat payers; vendors invited per buyer.
- **Kill rule (my proposal):** after 10 conversations, if fewer than 2 have faced a wrong-payee or poisoning scare and none would publish a file, rethink the segment.

## 6. Ten-question validation script (5 minutes each)
1. How do you pay or get paid in stablecoins today, and how often?
2. How do you confirm a vendor's wallet address? Who approves it?
3. Has a wrong-address or changed-details payment ever happened to you or someone you know?
4. Have you seen address poisoning in your wallet history?
5. Who can see your vendor payments today, and does that matter to you?
6. Would you ask a vendor to publish one file on their site to be verified?
7. Would you publish one, if a customer asked?
8. Which chain and token do you actually use? Would you move for this?
9. Who has to approve a payment at your company, and would it need approvals in the tool?
10. If this existed, what would you pay for, and what would be worth paying monthly?
Log: who, role, company type, exact words. Quotes are evidence; summaries are not.

## 7. Asks for the Whitechain booth (they said it is new and good)
1. An intro to the Whitepay team: would a merchant pilot automatic verified invoices?
2. Is there a design-partner path through the Builders Program, and what are the terms and KYC/KYB steps?
3. Is mainnet and the track USDT live, and when can exchange users move USDT to the chain?
4. Gas sponsorship: would they fund relayer gas for a pilot?
5. Can they put me in touch with teams already paying invoices on Whitechain?

## 8. Strengthen the idea (what to build now vs later)
Build now (cheap, and they help the demo):
- "Check an invoice" verify-only page (reuses the verification code).
- Browser-side merchant key generation and one-click `.well-known` file download.
- Key pinning: after the first verified payment, the buyer app pins the merchant key; a changed key shows a warning.
- New-key delay: refuse an unpinned key published less than N hours ago, to slow a quick domain takeover (the delay is my design choice, not researched).
- CSV export keyed by `invoiceId` so each payment reconciles automatically.
Roadmap (state, don't build): optional DNSSEC TXT anchor (BIP-353 style); approver thresholds and audit trail for AP teams; accounting/ERP connectors; per-payment auditor disclosure.

## 9. What I could not establish
- Any measure of willingness to pay.
- How many crypto-invoicing users actually worry about payee spoofing.
- Whether Request Network or others already offer a stronger payee check than the ENS display I found.
- Whitepay's merchant count; WhiteBIT's country split; independent data on small-business stablecoin use.
- The 2025 FBI figure from the FBI's own report.
