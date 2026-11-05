# E. Submission and demo package

## 1. README outline
1. **Title and one-line pitch.** Truce: invoices a buyer can verify before paying, paid gaslessly in USDT on Whitechain Sepolia. EXAMPLE DATA and testnet notice.
2. **The problem** in three sentences, with the FBI and address-poisoning figures marked "reported" and sourced.
3. **Why onchain, and what a regular rail cannot do** (the line Whitechain requires): a buyer-signed, payee-bound authorization that settles in about a second, is verifiable by anyone, and cannot be redirected by the app or relayer. Honest caveat: bank direct debit exists for domestic payments; the design is portable to other chains, and what is specific to Whitechain is the track USDT's EIP-3009, chain 1874 and the WBT relayer.
4. **Demo links:** video, explorer links for the verified contract, one settlement, one reverted swapped-payout attempt.
5. **How it works** (diagram from `B-DIAGRAMS.md` B3 and the pay-now sequence).
6. **Quickstart:** prerequisites (Node 22, Foundry), `git submodule update --init --recursive`, `npm install`, env file with a throwaway key, `CHAIN_MODE=mock` and `testnet`, how to get test WBT and USDT, run the demo, run tests.
7. **Merchant integration in about 20 lines** (the SDK example, with the line count stated).
8. **Architecture** (containers, data placement, trust boundaries).
9. **Security model and threat table** (condensed from `C-TECHNICAL.md` section 7).
10. **Current limitations** (required by Whitechain): funds not locked, public amounts and addresses, lookalike domains, sockpuppet fraud, single relayer, testnet only, no real users, Soul badge mocked (if built), things not tested (buyer contract wallets, mainnet).
11. **What is original and what is not:** the overlap with other entries and standards (ERC-8342, BIP-353) stated plainly.
12. **Open questions and roadmap:** stealth recipients, webhooks, DNSSEC anchor, approvals, mainnet with USDC.e, registry owner key question for Soul.
13. **Whitechain feedback** (link to `WHITECHAIN_FEEDBACK.md`), **AI use** (link to `docs/AI-USE.md`), **licence**, **team**.

## 2. Three-minute demo script (shot by shot)
Record at 720p or higher, no phone recording, no speed-up, no text-to-speech, narration by you, backstory under 20 seconds (ETHGlobal rules). The video must show each party: merchant, buyer, relayer, verifier.

| Time | On screen | What to say | Proof shown |
|---|---|---|---|
| 0:00 to 0:15 | Title card, EXAMPLE DATA banner | "A supplier emails: same invoice, new bank details. The buyer pays the wrong account. Truce lets the buyer check the payee first." | Banner visible |
| 0:15 to 0:40 | **Merchant view.** Setup page generates `truce.json`; dashboard creates an invoice: Northlight Design Studio to Beta Labs, 1,250 USDT, net 30 | "Northlight, a fictional agency, publishes one file on its own domain and signs the invoice with its wallet." | The file, the signed invoice, the payment link |
| 0:40 to 1:10 | **Attack.** Open a copy of the link with the payout wallet swapped. Checklist shows FAIL on signature and payout-not-in-domain-file; Pay is disabled | "Someone swapped the payout wallet. The signature no longer matches, and the wallet is not on the merchant's domain." | Red FAIL rows with plain messages |
| 1:10 to 1:25 | Terminal: submit the swapped invoice straight to the contract | "Even if the app is bypassed, the contract reverts: it only pays the wallet the merchant signed." | `BadMerchantSignature` revert, no gas spent |
| 1:25 to 2:00 | **Buyer view.** Honest link: PASS. Connect wallet, sign once, no gas prompt; receipt; open the explorer | "One signature. The relayer pays gas in WBT. Real USDT on Whitechain Sepolia." | Explorer page with the USDT transfer and `InvoicePaid` |
| 2:00 to 2:20 | **Verifier view.** Public verify page for the same invoice: PASS and settled; merchant dashboard row; CSV download | "Anyone can check it without a wallet, and the accountant gets a CSV with transaction links." | Verify page, dashboard, CSV |
| 2:20 to 2:45 | **If due-date mode is built:** a second invoice scheduled for its due time; drain the wallet, dashboard shows AT RISK; top up; it settles. **If not:** show the pinning warning when a domain's payout wallet changes | "The merchant sees early if collection might fail. It is a snapshot, not a lock." (or: "after a first payment we warn if a domain's wallets change") | Status badge change or warning |
| 2:45 to 3:00 | Limits slide and close | "Testnet only, example data, amounts are public, lookalike domains and fake sales are not solved. Contract, tests and feedback are in the repo." | Limits listed on screen |

Rehearse twice before recording. Keep a spare take of the attack scene and one of the payment scene; edit by cutting, never by speeding up.

## 3. Judging-criteria mapping
Whitechain publishes no formal weights, only what it wants to see and what it will not place. ETHGlobal's finalist criteria are Technicality, Originality, Practicality, Usability and WOW.

| Criterion (source) | Feature | Evidence in the repo and demo | Honest gap |
|---|---|---|---|
| Drop-in piece added in about 20 lines (Operate) | SDK `createInvoice` and the example merchant app | `examples/merchant-demo` with the line count in the README | Not an ERP or checkout plugin |
| Both merchant and customer views (Operate) | Merchant dashboard, buyer page, public verify page | Video scenes 0:15 to 2:20 | Plain UI |
| Beyond the first payment: refund, renewal, accountant export (Operate extra credit) | CSV export; capped refund in the contract (SHOULD); due-date collection (SHOULD) | CSV in the video; refund tests; due-date scene if built | Refund has no UI; due-date mode may be cut |
| Not a plain-transfer pay button (Operate "won't place") | Signed invoice, domain verification, on-chain payout enforcement | Contract source and tests | Overlaps other entries on gasless and refunds |
| Contract verified on Sepolia; real USDT payment with explorer link (hard requirement) | `InvoiceSettler`, track USDT | Explorer links in the README | Testnet value is zero |
| README line on why onchain stablecoin settlement (hard requirement) | README section 3 | Present | Portable to other chains |
| Public repo with steady commits (hard requirement) | Small commits, hook-enforced 1000-line limit | `npm run check:commits` output in the README | History started on Nov 5 |
| Demo video 2 to 4 minutes showing each party (hard requirement) | Script above | Video | |
| `WHITECHAIN_FEEDBACK.md` (hard requirement) | 11+ concrete issues already logged | File | |
| Technicality | EIP-712, EIP-3009 `receiveWithAuthorization`, ERC-1271 merchant signatures, simulate-before-send relayer, fuzz and invariant tests, SSRF guard | Tests, source | Buyer contract wallets and signed cancel UNVERIFIED unless tested |
| Originality | Buyer-side verification against the merchant's own domain, enforced by the contract | `COMPETITORS.md`, the attack scene | Domain-bound payees exist in Bitcoin (BIP-353); ERC-8342 binds invoices to payments |
| Practicality | B2B invoices with terms; fraud evidence; 5-minute merchant setup; buyer-led adoption plan | `MARKET-RESEARCH.md` | No real users, no willingness-to-pay data |
| Usability | One signature, zero gas, plain-language checks | Video | Needs a wallet on chain 1874 |
| WOW | The same swapped payout fails twice: in the app and on chain | Scenes 0:40 to 1:25 | |

## 4. Pitch deck outline (maximum 8 slides)
1. **Title and hook:** the "new bank details" email; project name; EXAMPLE DATA note.
2. **Problem:** reported BEC loss, address poisoning, bank rails now verify payees but stablecoin invoices do not (each figure caveated).
3. **How Truce works:** one diagram: domain file, signed invoice, buyer check, signature, contract pays the signed payout.
4. **Live demo screenshots:** the swapped-payout FAIL and the on-chain revert.
5. **Why onchain, why Whitechain:** payee-bound authorization, public verification; track USDT EIP-3009, WBT relayer; honest portability note.
6. **Architecture and security:** components, trust boundaries, top threats and mitigations.
7. **Honest limits and originality:** unlocked funds, public amounts, lookalike domains, sockpuppets; overlap with other entries and standards.
8. **Next steps and asks:** buyer-led adoption plan, ten-question validation, Builders Program, mainnet with USDC.e after audit, stealth recipients as phase 2.

## 5. Submission checklist
**Repo**
- [ ] Public GitHub repository with steady commit history; `npm run check:commits` shows 0 commits over 1000 lines
- [ ] No keys, `.env` or `node_modules` committed; submodules resolve (`git submodule update --init --recursive`)
- [ ] README complete: setup, architecture, current limitations, the "why onchain" line, explorer links
- [ ] `WHITECHAIN_FEEDBACK.md` complete (what worked, where stuck, what docs lacked)
- [ ] `docs/AI-USE.md` accurate; planning artifacts (`docs/`) included; licence file

**Chain evidence**
- [ ] `InvoiceSettler` deployed and **verified** on Whitechain Sepolia (chain 1874); address in README and `deployments/whitechain-sepolia.json`
- [ ] At least one real payment in the track USDT `0xcedfB5...55a7` with an explorer link
- [ ] Explorer link for the reverted swapped-payout attempt (or its simulation output)

**Video and docs**
- [ ] 2 to 4 minute demo showing merchant, buyer, relayer and verifier; example data labelled; limits stated
- [ ] Optional: slides (8 max); optional live URL

**ETHGlobal dashboard**
- [ ] Select **Whitechain** (one Whitechain prize per project); decide Finalist plus partner prizes vs partner prizes only (Finalist needs a 7-minute session)
- [ ] Submit before **Sat Nov 7 09:00 IST** (late submissions not accepted); be checked in at the venue
- [ ] Rerun the competitor radar and re-read the Whitechain track page for changes before submitting
