# Demo video script (about 3.5 minutes, you speak it)

Rules from ETHGlobal: 720p or higher, your own voice, no text-to-speech, no speed-up, backstory under 20 seconds, show each party (merchant, buyer, relayer, verifier). Whitechain's Operate track asks for a drop-in piece a separate demo app adds in about 20 lines, both a merchant and a customer view, and extra credit for refunds and an accountant export; this script shows each of those. It follows `docs/design/E-SUBMISSION.md` section 2 but replaces its "drain the wallet, show AT RISK" scene: that path was never run live. The scheduled payment below was (a 2-minute due date, collected by the scheduler).

## Before you press record (15 minutes)

- [ ] Server mode (`apps/web/.env.local` has `VITE_API_MODE=server`), no scenario switcher bar. Open `http://localhost:5173`.
- [ ] `CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server` running; `http://127.0.0.1:8787/healthz` says `"mode":"testnet"`. The Whitechain public RPC was slow at times (a health check took 9 seconds once); if it is slow when you start, wait or retake rather than talking through a stall.
- [ ] The storefront: `npm run shop -w @truce/merchant-demo` running (needs `MERCHANT_PK` in `.env`), page open at `http://127.0.0.1:8800`. Have `examples/merchant-demo/shop.ts` open in an editor, scrolled to the highlighted integration block (9 lines).
- [ ] Two browser windows side by side: the buyer (profile with the buyer account) and the merchant dashboard `/merchant` (profile with the merchant account, which is also the payout wallet). Close every other tab and notification. Do not show `.env` or the wallet's key screen.
- [ ] **Amounts: 0.01 to 0.5 USDT per invoice.** The buyer holds about 7 test USDT; a 1,250 USDT invoice fails on balance. Say once: "amounts are scaled down for the testnet".
- [ ] Terminal ready with `npm run e2e -- --attack-only` typed but not run. Explorer tab open on the contract: `0xCbe41B98D2333a1BD92d51Fbb6FE668c5170ff9d`.
- [ ] Do the whole thing once as a dry run. Record the attack scene and the payment scene twice; keep the best of each.

## Shots

Speak slowly. The words are a guide, not a contract; keep the meaning and the labels.

**0:00 to 0:15. The problem** (title card or the landing page, EXAMPLE DATA banner visible)
"A supplier emails: same invoice, new bank details. The buyer pays the wrong account. Truce lets the buyer check the payee before paying. Everything you see is example data on a test network."

**0:15 to 0:50. Merchant: a drop-in piece** (the storefront, then `shop.ts`)
On the studio's website press "Invoice me" on one service (0.01 USDT). A link appears. Switch to the code and point at the 9-line block.
"Northlight is a fictional design studio. Its website's server adds nine lines of code and gets back a signed invoice link. It publishes one file on its own domain naming the wallets it uses, and signs each invoice. Signing costs no gas."
(If you want to show `/setup` and the generated `truce.json`, do it here for 5 seconds.)

**0:50 to 1:20. The attack, in the app** (`/demo`: open the swapped-payout link)
Big FAIL; point at the two red rows (signature, payout not in the domain file); Pay is disabled.
"Someone swapped the payout wallet. The signature no longer matches, and the wallet is not on the merchant's own domain. The app shows FAIL and will not let you pay."

**1:20 to 1:40. The attack, on chain** (terminal: run `npm run e2e -- --attack-only`)
Point at `rejected on chain ... BadMerchantSignature. Nothing was sent.`
"Even if someone skips the app, the contract refuses. It only pays the wallet the merchant signed. This was checked before sending, so nothing was spent."

**1:40 to 2:20. Buyer, relayer and the live dashboard** (honest link `/pay/...`, the merchant dashboard visible in the other window)
PASS, ten checks, full payout wallet. Point at the blue "First payment to this domain from this browser" notice: it says a lookalike domain would look the same and to confirm the wallet another way for a large amount. Connect the buyer wallet, press Pay, sign once. The dashboard row flashes and turns Paid on its own. On the receipt point at the "Network fee" row, then open the explorer link: the `settle` call, the USDT transfer to the payout wallet, and that the sender is the relayer `0x37De...95Ff`.
"One signature, no gas for the buyer. A relayer pays the fee in WBT, and the receipt shows exactly what it paid. The merchant's dashboard updated by itself. The test USDT goes straight to the wallet the merchant signed."

**2:20 to 2:40. Verifier and accountant** (`/verify?hash=...`, the dashboard, Download CSV)
"Anyone can check this invoice without a wallet: it shows PASS and that it was paid on chain. The accountant gets a CSV with transaction links."

**2:40 to 3:05. Refund** (dashboard: open the paid invoice, Refund panel, amount 0.005, sign)
Show "Refunded so far" and "Left to refund" change and the explorer link. If you have time, try an amount above what is left and show the plain refusal. Then press "Download ledger" and open it: issued, payment and refund rows, each payment and refund with an explorer link, and the CSV row now showing the refunded and net-received amounts.
"The merchant can refund part of a payment, and the accountant's files follow. The payout wallet signs once. The money can only go back to the wallet that paid, and never more than was paid. The contract enforces both."

**3:05 to 3:30. Pay on the due date** (new invoice, "Demo: due in N minutes" = 2; buyer chooses "On the due date")
Show Scheduled; you may cut to the finished Paid row or the explorer once it lands.
"The buyer can sign now and be collected on the due date. For this video the due date is time-compressed to two minutes. The signature is a commitment, not locked funds: if the balance is short on the day, the collection fails and the invoice shows Failed."

**3:30 to 3:45. Limits and close** (README "Limitations" on screen)
"Testnet only, example data, an unaudited contract. Invoices are not private: amounts and addresses are public and the details are stored unencrypted. Truce checks who you pay; it does not hide it. A lookalike domain is not detected on a first payment. Code, tests and our Whitechain feedback are in the repo."

The monthly series option ("Number of invoices") is not in the video: it only creates separate invoices faster, and saying "renewals" about it would over-claim. If you mention it, say "a series of separate invoices".

## If something goes wrong while recording

- Wallet prompt does not appear: reload, confirm chain 1874, retry. Cut the dead time in editing; never speed up.
- Payment or refund fails: do not narrate around it. Stop, check `http://127.0.0.1:8787/healthz` (relayer WBT) and the buyer's and payout wallet's USDT, retake.
- Over 4 minutes: cut the due-date scene first, then the CSV, then the storefront code view. Never cut the FAIL, the revert, or the real payment.

## If a judge asks "is it private?"

"No. Truce is about integrity, not confidentiality. The attack we defend against is a changed bank-details email: nobody needs to read the invoice for that, they only change where the money goes. A signature and the contract stop that. Details are stored unencrypted and amounts and addresses are public. Encryption would not stop a swapped payout. Confidentiality is not built." (The longer version is in `docs/PITCH.md`.)

## Words to avoid

first, only, guaranteed, trustless, "verified business", "needs Whitechain", "locked funds", "subscription", "recurring". Say "test USDT" and "test network", not "real money".
