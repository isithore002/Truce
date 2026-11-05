# Truce v2: the buildable, real-world version

> ## FROZEN as of 2026-11-05 (about 21:30 IST). About 35 hours to the Nov 7 09:00 IST deadline.
> **Rule:** nothing is added unless something of equal size is removed. Decisions below are closed.
>
> **Product:** invoices a buyer can verify before paying, collected on the due date, paid gaslessly in USDT on Whitechain Sepolia (chain 1874).
> **Track:** Operate only. **Contract:** `InvoiceSettler` (written from scratch; do not copy `PaymentRouter`).
> **Token:** track USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (EIP-3009). **Network:** testnet only, no mainnet transactions.
>
> | Tier | Items |
> |---|---|
> | MUST | `InvoiceSettler` + tests + verified deploy; invoice sign/verify library; relayer; SDK (~20 lines); merchant dashboard (create, status, CSV); buyer page with PASS/FAIL; **public verify page; key pinning (payee-change warning)**; one real USDT payment with explorer link; README; `WHITECHAIN_FEEDBACK.md`; 2-4 min demo incl. the swapped-payee attack |
> | SHOULD | **pay-on-due-date with a pre-due balance check and a clear Failed state** (booth: fits B2B invoices with terms; the weak spot is unlocked funds); capped refunds in contract + tests only (no refund UI, swapped out to pay for the line above) |
> | STRETCH | mocked Soul badge ("Individual KYC-verified on WhiteBIT (demo data, mocked)") via `SoulStatus` adapter |
> | OUT | stealth addresses, real Soul reads, mainnet transactions, DNSSEC, approvals, auditor package |
>
> **Cut order if late:** Soul badge, key pinning, refund UI (keep contract refund), CSV styling, scheduled collection. **Never cut:** on-chain payout enforcement, PASS/FAIL badge, one real USDT payment.
> **Open items to confirm (do not block):** signed `cancelAuthorization` on the track USDT; faucet drip (docs 0.5 WBT vs flyer 2 WBT); registry owner key (README open question).
> **Repo layout:** `contracts/` (Foundry), `packages/invoice-lib/`, `apps/relayer/`, `apps/web/` (merchant, buyer, verify pages), `sdk/`, `docs/`.
> **Definition of done:** a stranger can open the README, run one command set, create an invoice, pay it with testnet USDT, see PASS and the settled status, and click through to the explorer.
> **Commit discipline:** commit at least every few hours (judges check history); AI use documented in the README.
Date: 2026-11-05. Submission deadline: Sat Nov 7, 09:00 IST (about 36 hours of work). Track: Whitechain Operate.
Supersedes the stealth-first plan in `archive/SPEC-v1-stealth-SUPERSEDED.md` (kept for reference). Evidence behind every choice is in
`MARKET-RESEARCH.md` and the Whitechain research in chat.

## 1. What changed and why
| Decision | v1 | v2 | Reason (evidence) |
|---|---|---|---|
| Stealth recipient addresses | core | **roadmap** | Key backup burden, sweep leak re-links funds, amount stays public, privacy demand evidenced only by project claims, heavy for 36 hours |
| Payee enforcement | app-side check | **on-chain**: contract verifies the merchant's signature and pays only the signed payout | A malicious app or relayer can no longer redirect funds |
| Settlement | direct transfer to stealth address | pull to contract with `receiveWithAuthorization`, then push to payout | Only the contract can redeem the buyer's signature, so front-running cannot strip the record |
| Due dates | stretch | **core option**: buyer signs now, collection happens at the due date (`validAfter`) | Separates us from the checkout-style `PaymentRouter` already live on the testnet |
| Identity | domain key | domain key (+ optional WB Soul badge, stretch) | Soul: mainnet only, ~22K souls, one owner key, no business identity |
| Token | track USDT only | **any EIP-3009 token** (testnet USDT; mainnet USDC.e verified to have it) | Mainnet has no official USDT yet; USDC.e is Circle's FiatTokenV2_2 |
| Adoption | merchant-led | **buyer-led** verify page plus 5-minute merchant setup | Payer bears fraud loss; fiat precedent (payee verification sold to payers) |

## 2. One-paragraph product
A merchant publishes one small file on its own domain naming its signing wallet and payout wallet. It issues invoices signed by that wallet.
The buyer opens an invoice link and the app shows PASS or FAIL against the domain file. The buyer signs one USDT/USDC authorization, either to pay now
or to be collected on the due date. A relayer pays gas in WBT. The contract refuses to pay anyone except the payout wallet the merchant signed, settles
each invoice once, and supports capped refunds. A public verify page and an accountant CSV give the "customer-checkable record" Whitechain asks for.

## 3. Components (all must exist for the demo)
1. **`InvoiceSettler.sol`** (about 120 lines, verified on chain 1874).
2. **Invoice library (TypeScript):** EIP-712 types, hash, sign, verify, domain-file check, key pinning (localStorage).
3. **Relayer (Node):** simulate, submit `settle`, scheduler for due-date collections, rate limit, daily WBT budget.
4. **SDK (about 20 lines for a merchant app):** `createInvoice(...)` returns a link; webhook or callback on `InvoicePaid`.
5. **Merchant dashboard:** create, list with status (issued, scheduled, paid, failed, overdue, refunded), refund, CSV export, setup page that shows the JSON to upload.
6. **Buyer page:** verification badge, details, pay now or pay on due date, cancel scheduled payment, receipt.
7. **Public verify page:** paste a link, see PASS/FAIL and on-chain status, no wallet needed.
8. **Docs:** README (setup, architecture, limitations, why onchain), `WHITECHAIN_FEEDBACK.md`, demo video.

## 4. Contract design (sketch, not final code)
```
struct Invoice { bytes32 invoiceId; address merchant; address payout; address token; uint256 amount;
                 uint64 dueDate; uint64 expiry; address payer /*0 = anyone*/; bytes32 domainHash; bytes32 memoHash; }
struct Auth    { address from; uint256 validAfter; uint256 validBefore; uint8 v; bytes32 r; bytes32 s; }
mapping(bytes32 => Payment) payments;   // keyed by invoiceHash; payer, payout, amount, refunded, paidAt

settle(Invoice inv, bytes merchantSig, Auth a) external nonReentrant whenNotPaused
  - require(block.timestamp <= inv.expiry); require(payments[h].paidAt == 0)           // settle once
  - h = hashTypedData(inv); require(SignatureChecker.isValidSignatureNow(inv.merchant, h, merchantSig))   // EOA or Safe
  - require(inv.payer == address(0) || inv.payer == a.from)
  - require(tokenAllowed[inv.token])                                                    // allowlist set in constructor
  - IToken3009(inv.token).receiveWithAuthorization(a.from, address(this), inv.amount, a.validAfter, a.validBefore, h, a.v, a.r, a.s)
  - IERC20(inv.token).safeTransfer(inv.payout, inv.amount); store payment; emit InvoicePaid(h, inv.merchant, a.from, inv.payout, amount)
refund(bytes32 h, uint256 amount, Auth m)   // m: payout wallet signs receiveWithAuthorization(payout -> contract) with nonce = keccak(h, refundIndex)
  - cap: refunded + amount <= paid; funds go to the ORIGINAL payer only; emit Refunded
```
Properties: the buyer's signature fixes token, amount, destination (this contract) and nonce (= invoice hash); the contract fixes the payout from the
merchant-signed struct. Nobody, including our relayer, can change who gets paid. No admin can move user funds; owner can only pause new settlements
and set relayer gating (start with ungated plus rate limits, state it as a limitation).
`receiveWithAuthorization` requires `msg.sender == to`, so the signature is only redeemable through this contract.

## 5. Buyer-side verification (the trust anchor, off chain)
1. Fetch `https://<domain>/.well-known/truce.json` server-side: `{version, signingAddress, payoutAddresses[], chainIds[]}`.
2. Check: invoice `merchant == signingAddress`; `payout in payoutAddresses`; `domainHash == keccak(domain)`; chain and token match; not expired.
3. Show domain, merchant address, payout address, amount, due date, memo. PASS or FAIL in plain words.
4. After the first payment, pin domain to (signingAddress, payout). If either changes later, show a warning and require explicit confirmation.

## 6. Test plan
Foundry (mock EIP-3009 token plus a fork test on the real testnet USDT):
- settle pays exactly `payout`; wrong signer reverts; tampered amount/payout reverts; expired reverts
- settle twice reverts; payer-locked invoice rejects another payer; non-allowlisted token reverts
- authorization with `validAfter` in the future reverts until due; works after
- buyer `cancelAuthorization` then settle reverts; empty-wallet settle reverts cleanly
- refund: cap, double refund, wrong signer, goes only to original payer
- Safe-style (ERC-1271) merchant signature accepted
TypeScript: sign/verify round trip; every changed field fails; domain-file mismatch cases; pinning warning; relayer does not send a failing simulation; budget and rate limit.

## 7. 36-hour plan with go/no-go gates
| When | Work | Gate |
|---|---|---|
| H0 to H3 | WBT from faucet, test USDT via YetiTrade, read `DOMAIN_SEPARATOR()` and `name()`, send one real signed `receiveWithAuthorization` from a script | **If it fails**: use `permit` + `transferFrom` (the token also has `permit`) and keep everything else |
| H3 to H10 | Contract, tests, deploy and verify on 1874 | Tests green and verified contract link |
| H10 to H18 | Invoice library, relayer, SDK | One end-to-end payment from script |
| H18 to H28 | Merchant dashboard, buyer page, verify page, CSV | Full demo path in browser |
| H28 to H33 | Scheduled collection, refund UI, pinning | If late: cut scheduling to a demo with a 2-minute due date, or cut pinning |
| H33 to H36 | README, feedback file, video (2 to 4 minutes), submit with Whitechain selected | Submit before 09:00 IST |
Cut order if time runs short: pinning, CSV styling, refund UI (keep contract refund), scheduled collection. Never cut: on-chain payout enforcement, verify badge, one real USDT payment.

## 8. Real-world adoption
- **First users:** finance/ops people at crypto-native companies and DAOs paying vendors; crypto-native agencies and freelancers billing them; Ukrainian IT firms paid in stablecoins.
- **Wedge:** buyer-led. The verify page works for any signed invoice. A buyer asks vendors to publish one file; each vendor reuses it with every customer.
- **Merchant effort:** one JSON file and an existing wallet. No new keys to back up.
- **Where it runs:** testnet for the hackathon; mainnet today with USDC.e (USDT arrives later per the docs). The contract is chain-agnostic; Whitechain is the first deployment.
- **Validation before building more:** the ten-question script in `MARKET-RESEARCH.md`. Kill rule: fewer than 2 of 10 have faced a payee or address error and none would publish a file.
- **Money (hypotheses only):** free verify and setup; paid gas sponsorship, team approvals, audit exports.

## 9. Honest limits (put these in the README)
- Merchant, payer, payout and amount are public on chain. Invoice details stay off chain (hash only). Stealth recipients are phase 2.
- A signed authorization is a commitment, not locked funds: an empty wallet at the due date fails and retries.
- Domain binding does not stop a lookalike domain or a compromised domain before first use; pinning helps afterwards.
- Sockpuppet fraud (two wallets faking a sale) is not detectable.
- The relayer is a single service we run; if it is down the buyer can submit the signed call with their own WBT.
- Overlap: a live `PaymentRouter` on the testnet already does merchant-signed gasless orders and refunds. Our differences are permissionless domain identity, due-date collection, the verify page and pinning. Ask the booth whether that contract is a Whitechain reference.
- Testnet only, no real users, one-person-days of testing.

## 10. Later (not in this build)
Stealth recipient mode; real WB Soul read (mainnet, read-only) once testnet or KYB exists; DNSSEC anchor; approval workflows for AP teams; ERP connectors; auditor disclosure packages.

## 11. Booth answers (Whitechain team member, 2026-11-05) and what they change
1. **Soul on Sepolia: unknown, do not wait.** Keep the whole demo on testnet and **mock the Soul data, labelled as mocked.**
   Build a small `SoulStatus` adapter: `getStatus(address) -> { isSoul, verified, level }`. Ship a mock implementation (fixed demo addresses) and,
   behind a flag that is OFF in the demo, a real implementation that reads mainnet `SoulRegistry` / `IsVerified` over RPC.
2. **KYB is planned, no timeline. Today `IsVerified` reflects personal KYC.** Badge copy must say so. Use exactly:
   "Individual KYC-verified on WhiteBIT (demo data, mocked)". Never write "verified business" or "WhiteBIT-verified merchant".
3. **Registry owner key: no answer yet.** Not a blocker. Put it in the README under open questions and risks (single owner address today).
4. **`PaymentRouter` (0x9f38...026E) is probably another team's entry, not a Whitechain reference. Do not build on it.**
   Write our contract from scratch. Ideas like capped refunds are generic, but do not copy their code.
5. **Anything beyond reads on mainnet means real WBT.** No mainnet transactions during the hackathon. Mainnet claims in the README must say
   "USDC.e implementation has `receiveWithAuthorization` per its verified ABI; not tested live by us."
6. Testnet RPC is solid per the team; use `rpc.testnet.whitechain.io` (and Ankr as backup).

## 12. Booth feedback on the idea (opinion, not data) and what we do with it
1. **Due-date collection fits B2B invoices with payment terms, less so one-off purchases.** Pitch it only for invoices with terms. Promoted to SHOULD (swap: refund UI removed; refunds stay in the contract and tests).
2. **Weak spot: funds are not locked. Merchants want early warning.** Build a health check:
   - Relayer reads `balanceOf(payer) >= amount`, `authorizationState(payer, nonce)` (not used or cancelled), `isBlocked(payer)` false, and `now < validBefore`.
   - Runs at signing, T-72h, T-24h, T-1h and T0 (demo: compressed to seconds).
   - States: `SCHEDULED_OK`, `AT_RISK` (reason: low balance / cancelled / expiring), `PAID`, `FAILED` (reason shown; retry until `validBefore` = due + grace).
   - Merchant dashboard badge plus a webhook (`invoice.at_risk`, `invoice.failed`); buyer page shows a low-balance banner when opened.
   - Copy must say: the check is a snapshot, not a lock. The buyer can still empty the wallet after it.
   - Roadmap only: optional pre-fund (lock) mode for merchants who want a guarantee.
3. **Demo hero moment: the FAIL case with a swapped payout wallet.** Show it twice: the buyer app shows FAIL, and a direct on-chain `settle` with the swapped payout reverts.
4. **No real merchant is available. Use a made-up one, labelled as an example:** "Northlight Design Studio" (fictional) bills "Beta Labs" (fictional) 1,250 USDT on 30-day terms.
   Show a persistent "EXAMPLE DATA" banner; the demo compresses 30 days into about two minutes and says so on screen.

### Demo storyline (3-4 minutes)
1. Banner: EXAMPLE. Northlight Design Studio issues an invoice to Beta Labs: 1,250 USDT, net 30 (time-compressed).
2. Attack: payout wallet swapped in the "email" copy -> verify page FAIL; direct contract call with the swapped payout reverts.
3. Honest invoice: PASS, buyer signs once to be collected on the due date; dashboard shows `SCHEDULED_OK`.
4. Drain the buyer wallet -> dashboard flips to `AT_RISK` before the due date; top up -> back to OK.
5. Due time: collection succeeds; explorer link; settled status on the public verify page; CSV row.
6. Limits stated on screen: snapshot not a lock, testnet, example data.
