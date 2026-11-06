# Demo video script (about 3 minutes, you speak it)

Rules from ETHGlobal: 720p or higher, your own voice, no text-to-speech, no speed-up, backstory under 20 seconds, show each party (merchant, buyer, relayer, verifier). This script follows `docs/design/E-SUBMISSION.md` section 2 but replaces its "drain the wallet, show AT RISK" scene: that path was never run live. The scheduled payment below was (a 2-minute due date, collected by the scheduler).

## Before you press record (10 minutes)

- [ ] Server mode (`apps/web/.env.local` has `VITE_API_MODE=server`), no scenario switcher bar. Open `http://localhost:5173`.
- [ ] `CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server` running; `http://127.0.0.1:8787/healthz` says `"mode":"testnet"`.
- [ ] Wallet extension: merchant account and buyer account imported; chain 1874 added. Close every other tab and notification. Do not show `.env` or the wallet's key screen.
- [ ] **Amounts: 0.01 to 0.5 USDT per invoice.** The buyer holds about 7.25 test USDT; a 1,250 USDT invoice fails on balance. Say once: "amounts are scaled down for the testnet".
- [ ] Terminal ready with `npm run e2e -- --attack-only` typed but not run. Explorer tab open on the contract: `0xCbe41B98D2333a1BD92d51Fbb6FE668c5170ff9d`.
- [ ] Do the whole thing once as a dry run. Record the attack scene and the payment scene twice; keep the best of each.

## Shots

Speak slowly. The words are a guide, not a contract; keep the meaning and the labels.

**0:00 to 0:15. The problem** (title card or the landing page, EXAMPLE DATA banner visible)
"A supplier emails: same invoice, new bank details. The buyer pays the wrong account. Truce lets the buyer check the payee before paying. Everything you see is example data on a test network."

**0:15 to 0:45. Merchant** (`/setup`, then `/merchant`)
Show the generated `truce.json` (signing wallet + payout wallet). Create one invoice: Northlight Design Studio bills Beta Labs, 0.01 USDT. Sign it in the wallet. Copy the pay link.
"Northlight is a fictional design studio. It publishes one file on its own domain naming the wallets it uses, and it signs each invoice. Signing costs no gas."

**0:45 to 1:15. The attack, in the app** (`/demo`: open the swapped-payout link)
Big FAIL; point at the two red rows (signature, payout not in the domain file); Pay is disabled.
"Someone swapped the payout wallet. The signature no longer matches, and the wallet is not on the merchant's own domain. The app shows FAIL and will not let you pay."

**1:15 to 1:35. The attack, on chain** (terminal: run `npm run e2e -- --attack-only`)
Point at `rejected on chain ... BadMerchantSignature. Nothing was sent.`
"Even if someone skips the app, the contract refuses. It only pays the wallet the merchant signed. This was checked before sending, so nothing was spent."

**1:35 to 2:10. Buyer and relayer** (honest link `/pay/...`, then the explorer)
PASS, ten checks, full payout wallet. Connect the buyer wallet, press Pay, sign once. Open the receipt's explorer link; show the `settle` call, the USDT transfer to the payout wallet, and that the sender is the relayer `0x37De...95Ff`.
"One signature, no gas for the buyer. A relayer pays the fee in WBT. The test USDT goes straight to the wallet the merchant signed."

**2:10 to 2:30. Verifier and accountant** (`/verify?hash=...`, `/merchant` dashboard, Download CSV)
"Anyone can check this invoice without a wallet: it shows PASS and that it was paid on chain. The merchant's dashboard shows it as paid, and the accountant gets a CSV with transaction links."

**2:30 to 2:50. Pay on the due date** (new invoice, "Demo: due in N minutes" = 2; buyer chooses "On the due date")
Show Scheduled; you may cut to the finished Paid row or the explorer once it lands.
"The buyer can sign now and be collected on the due date. For this video the due date is time-compressed to two minutes. The signature is a commitment, not locked funds: if the balance is short on the day, the collection fails and the invoice shows Failed."

**2:50 to 3:00. Limits and close** (README "Limitations" on screen)
"Testnet only, example data, an unaudited contract. A lookalike domain is not detected. Code, tests and our Whitechain feedback are in the repo."

## If something goes wrong while recording

- Wallet prompt does not appear: reload, confirm chain 1874, retry. Cut the dead time in editing; never speed up.
- Payment fails: do not narrate around it. Stop, check `http://127.0.0.1:8787/healthz` (relayer WBT) and the buyer's USDT, retake.
- Over 4 minutes: cut the due-date scene first, then the CSV. Never cut the FAIL, the revert, or the real payment.

## Words to avoid

first, only, guaranteed, trustless, "verified business", "needs Whitechain", "locked funds". Say "test USDT" and "test network", not "real money".
