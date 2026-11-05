# SealedInvoice: private invoices a buyer can authenticate

Track: Whitechain **Operate** (one Whitechain prize per project). Deadline: Sat Nov 7, 09:00 IST.
Status: spec for the minimum build. Everything marked UNVERIFIED must be tested before relying on it.

## 1. Pitch (what judges hear)
A merchant signs each invoice with a key published on its own domain. The buyer's app checks that signature
against the domain before paying, so an email that says "we changed our bank details" fails verification.
The payment goes to a one-time stealth address, so outsiders cannot see who was paid or link invoices together.
The buyer pays with one signature, and a relayer pays gas in WBT, so nobody needs to fund the stealth address.

One sentence: **private invoices that a buyer can authenticate, paid in USDT on Whitechain with no gas step.**

## 2. What is and is not original (checked 2026-11-05)
- NOT original: stealth-address invoicing (Instealth, ETHGlobal Superhack 2024, 23 commits, no licence, no tests, gas via Alchemy AA).
- NOT original: Merkle proof of a tax amount (Instealth `/proof` page).
- No keyword hit in either Instealth or SpectrePay source for: merchant-signed invoices, domain-bound payee, EIP-3009 / permit gasless stealth payments, scheduled payment.
  This is a keyword search of two repos, not a survey. Other projects (Veilpay, ENStealth Unlinked, Request Network) were not read in code.
- **Competitor already live on the testnet (found 2026-11-05 via the explorer API):** verified contract `PaymentRouter` at
  `0x9f38D33010345DCd62e26640b539263FA139026E` (verified 14:13 UTC today, creator `0x3c86A87353f3295183Cf613b98d6765023277046`; who built it is unknown).
  It already has merchant-signed EIP-712 orders (`merchant, amount, orderId, deadline`), relayer-gated gasless `payOrder` via `receiveWithAuthorization`,
  `payDirect` with a memo, capped refunds to the original payer, pause, and a `MerchantRegistry` in which a "WhitePay operator" registers merchants,
  marks them verified, and links an ENS name. Its `PaymentSettled` event publicly shows merchant, payer, payout and amount, and the order is readable in calldata.
  So "merchant-signed + gasless + refunds" is NOT original on this chain. Our differences: permissionless identity (merchant's own domain key, not an operator registry),
  recipient privacy (stealth), and B2B invoices with due dates (the order I decoded had a deadline about 4 minutes after payment, i.e. checkout style).
  Ask the booth whether this contract is a Whitechain reference or a team's entry.
- Observed weakness in Instealth: the merchant's stealth meta-address travels inside the invoice email (`sendInvoiceEmail(newInvoice, email, stealthMeta)`), so an attacker who edits the email can swap it.

## 3. Parties
Merchant, Buyer, Relayer (we run it), Verifier/auditor (reads a package; stretch).

## 4. Flow
1. **Merchant setup.** Publishes `https://<domain>/.well-known/sealedinvoice.json`:
   `{ "version":1, "signingAddress":"0x..", "stealthMetaAddress":"st:..", "chainId":1874 }`.
   The meta-address lives here, never in the invoice email.
2. **Create invoice.** Merchant signs an EIP-712 `Invoice{ invoiceId(128-bit random), domain, amount, token, chainId, dueDate, memoHash }`.
   `invoiceHash` = the EIP-712 struct hash. Output: a payment link containing the invoice and signature.
3. **Buyer opens link.** The buyer app's backend fetches the `.well-known` file over HTTPS (server-side, avoids CORS) and checks:
   signature recovers to `signingAddress`; invoice `domain` equals the domain fetched; `chainId` and token match. Show a clear pass/fail badge and the domain.
4. **Pay.** App derives a one-time stealth address from the meta-address in the .well-known file (ERC-5564 scheme 1, ScopeLift SDK).
   Buyer signs one `transferWithAuthorization(buyer -> stealth, amount, validAfter, validBefore, nonce = invoiceHash)` on the track USDT.
5. **Relay.** Relayer simulates (`eth_call`), then calls `SealedSettler.settle(...)`, which calls the USDT and emits an ERC-5564-compatible `Announcement`. Relayer pays WBT gas.
6. **Merchant scans** announcements with its viewing key, matches `invoiceHash`, marks the invoice Paid.
7. **Spend.** The stealth address signs its own `transferWithAuthorization` to wherever the merchant wants. Relayer pays gas, so the stealth address never needs WBT.
8. **Stretch: refund, scheduled payment (set `validAfter` = due date), auditor package.**

## 5. Contracts (deploy and verify on Whitechain Sepolia, chain 1874)
`SealedSettler` (~60 lines):
- immutable `USDT` = `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`
- `settle(from, stealth, value, validAfter, validBefore, nonce, v, r, s, ephemeralPubKey, metadata)`:
  require `stealth != address(0)`, bounded `metadata` length; call `USDT.transferWithAuthorization(...)`; emit
  `Announcement(1, stealth, from, ephemeralPubKey, metadata)` (same event signature as ERC-5564 so the SDK can scan it).
- `announce(...)`: permissionless, idempotent re-announce (recovers from front-running, see 7).
- No funds are held by the contract. No admin. No upgradeability.

## 6. Relayer (off-chain service) and drain protection
- Accepts only calls shaped for `SealedSettler.settle`; rejects anything else.
- Simulates first. A failing simulation is never sent, so a buyer with an empty wallet costs no gas.
- Per-IP rate limit and a daily WBT budget; refuses when the budget is spent.
- Faucet reality: 2 WBT per day per GitHub account (flyer). Budget accordingly and keep transactions few.

## 7. Known weaknesses (put these in the README)
- USDT is transparent: **amount, timing and the buyer's sending address are public.** Only recipient identity and linkability are hidden.
- Privacy is against outsiders and competitors, not against an exchange or regulator once funds are cashed out.
- Domain binding does not stop a buyer trusting a lookalike domain, and the merchant must host one file.
- Sockpuppet fraud (two wallets faking a sale) cannot be detected on chain.
- Front-run: someone could submit the buyer's public signature directly to the USDT, so funds land without an announcement.
  Mitigation: relayer/buyer re-announces (`announce`), and the buyer's receipt carries the ephemeral key. L2 sequencing lowers but does not remove this.
- `invoiceHash` is the nonce and is visible on the USDT event; `invoiceId` must be high-entropy so the hash cannot be guessed.
- **Sweep leak:** moving funds from many stealth addresses into one public treasury address re-links them to the merchant for outsiders.
  Advice in the README: spend straight from the stealth address (to a supplier or an exchange deposit) and do not consolidate.
- **Key management:** a merchant who loses its keys loses the funds at its stealth addresses. Derive the stealth keys from a signature of the merchant's own wallet
  (as Instealth does) so there is no new secret to back up. This works only with wallets that sign deterministically; test it.
- **The buyer's wallet prompt shows only a one-time address.** The buyer must trust the app. The app shows a "how this address was derived" proof
  (the buyer knows the ephemeral key, so the derivation can be re-checked); the app must be open source.
- **Relayer trust:** the relayer cannot redirect funds (the signature fixes recipient and amount) but can delay or censor. Fallback: the buyer submits the signed transfer themselves with WBT.
- Testnet only, no real users.

## 8. Tests
Foundry (mock EIP-3009 token for unit tests, plus a fork test against `https://rpc.ankr.com/whitechain_testnet` with the real token):
- settle moves USDT to stealth and emits the Announcement
- replayed nonce reverts; expired window reverts; before `validAfter` reverts
- wrong signer reverts; wrong value reverts
- `cancelAuthorization` then settle reverts
- zero stealth address reverts; oversized metadata reverts
- front-run then `announce` recovers the payment record
TypeScript (vitest):
- invoice sign/verify round trip; any changed field fails
- .well-known signer mismatch fails; domain mismatch fails; chain/token mismatch fails
- stealth derive then scan round trip; spend signature accepted by the token
- relayer: failing simulation is not sent; budget and rate limit enforced

## 9. Stretch: per-payment disclosure (UNVERIFIED novelty, math from ERC-5564 scheme 1)
Stealth public key P = S + h(v*R)*G, where S is the merchant spend key, v its viewing key, R the ephemeral public key.
To prove one payment to an auditor, the merchant discloses only `s_h = h(v*R)`; the auditor checks `P == S + s_h*G` using the public S from the domain file.
This reveals one payment and not the viewing key. Test it before claiming it. Instealth's Merkle tax proof is a different, narrower mechanism.

## 10. UNVERIFIED items to test first (tonight)
1. EIP-712 domain of the track USDT (`name()`, `DOMAIN_SEPARATOR()`); a signed `transferWithAuthorization` is accepted.
2. `cancelAuthorization` with a signature; `authorizationState`.
3. Whether any ERC-5564 announcer exists on chain 1874 (we deploy our own settler anyway).
4. Gas cost of `settle`, against the 2 WBT/day faucet.
5. YetiTrade liquidity: can 2 WBT buy enough test USDT?

## 11. Scope tiers
- MUST: sections 4.1 to 4.7, `SealedSettler`, relayer, merchant dashboard, buyer page with the verification badge, tests above, README, `WHITECHAIN_FEEDBACK.md`, 2-4 minute demo.
- SHOULD: verify-only "check an invoice" page (buyer-first entry), browser-side merchant setup that downloads the `.well-known` file,
  key pinning with a warning on key change, refund, accountant CSV keyed by `invoiceId`.
  The announcement `metadata` carries the invoice hash so the merchant can map a payment to an invoice (the hash is already public as the USDT nonce).
  See `SealedInvoice-market-research.md` for users and adoption.
- STRETCH: scheduled payment, auditor package (section 9).
- ROADMAP ONLY (no code): receivable financing (invoice fraud via sockpuppets is not solved).

## 12. Demo (3 to 4 minutes, each party on screen)
1. Attack: edit an invoice email to swap the payee. The buyer app shows FAIL. (Compare: Instealth sends the meta-address in the email.)
2. Honest invoice: PASS badge, buyer signs once, no gas prompt.
3. Explorer: USDT moved to an unknown address; nothing links it to the merchant.
4. Merchant dashboard finds the payment with its viewing key.
5. Relayer refuses an empty-wallet payment without spending gas.
6. (Stretch) auditor verifies one payment.

## 13. README line: why onchain on Whitechain
Regular rails expose counterparties and bank details to intermediaries and give no recipient identifier that is both unlinkable and provably the merchant's.
Honest caveat to include: stealth addresses work on any EVM chain. The Whitechain-specific parts are the track USDT (EIP-3009), chain 1874 binding, and WBT relayer gas.
