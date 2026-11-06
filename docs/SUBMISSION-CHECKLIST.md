# Submission checklist (human steps)

Deadline: **Sat 2026-11-07 09:00 IST** (aim to submit by 08:00). The autonomous build did everything that could be done without a browser or your accounts. These steps are yours. Status of the build: `docs/AUDIT.md`.

## 1. Click through the app once (about 15 minutes)

Nobody has seen the screens in a real browser with a wallet extension. Do this before recording, and fix or cut whatever misbehaves.

Terminal 1 (real testnet; use `CHAIN_MODE=mock` instead if you only want to look):
```bash
CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server
```
Terminal 2: `npm run dev -w apps/web`, then open http://localhost:5173 in a browser with MetaMask or Rabby.

Wallets: the merchant page signs with the **example merchant wallet** `0x19d4...51Dc` (import the MERCHANT_PK key into the wallet), the buyer pays with `0xB17a...a28E` (import PAYER_PK). Use a separate browser profile for each, or switch accounts.

| # | Do this | Expect |
|---|---|---|
| 1 | Home page loads | Yellow EXAMPLE DATA banner at the top |
| 2 | `/merchant` -> Connect wallet (merchant account) | Wallet asks to connect; page shows the signing wallet, the `truce.json` text, the Soul badge "Individual KYC-verified on WhiteBIT (demo data, mocked)" |
| 3 | Fill nothing (the example is pre-filled) -> "Sign and create invoice" | Wallet shows a typed-data signature (no gas); a pay link appears |
| 4 | Open the link in the buyer profile -> `/pay/...` | Big green PASS, ten checks, full payout wallet shown |
| 5 | Connect the buyer wallet | Chain 1874 is added or switched to; balance shown |
| 6 | Pay | One signature prompt (no gas), "Sending the payment", then Paid with an explorer link |
| 7 | `/verify?hash=...` -> "Demo: show a copy with the payout wallet swapped" | Big red FAIL, the failing checks highlighted |
| 8 | `/merchant` dashboard | The row shows Paid with a Transaction link; "Download CSV" downloads a file that opens in a spreadsheet |
| 9 | Create a second invoice with "due in 2 minutes", open it as the buyer, choose "Pay on the due date", sign | "Payment scheduled", collected by itself about 2 minutes later |
| 10 | Create a third, schedule it, press "Cancel my authorization" | "Authorization cancelled" |

Optional, to see the payee-changed warning: after step 6, add a second wallet to `payoutAddresses` in `fixtures/domains/northlight-design.example.json`, restart the server, set that wallet as the payout wallet on the Merchant page, create a new invoice and open it in the same browser as the buyer.

Write down anything that looks wrong. The README already says the click-through is a manual check.

## 2. Record the video (2 to 4 minutes)

Shot list and wording: `docs/design/E-SUBMISSION.md` section 2. Must show each party (merchant, buyer, relayer, verifier), the swapped-payout FAIL in the app, and the swapped-payout revert (`npm run e2e -- --attack-only` prints it). Say on screen and aloud that the data is **example data** and the due date is **time-compressed**. 720p or higher, your own voice, no speed-up. Keep a spare take of the attack and the payment.

## 3. Check before you submit

- [ ] `git status` clean, `git log origin/main..HEAD` empty (everything pushed).
- [ ] `npm run check:commits` reports 0 over the limit.
- [ ] Optional: `npm run radar` again. On 2026-11-06 it flagged one other entry with domain verification through a platform attestor (`MerchantRegistry` `0xF6B6...6C47`). The README states the difference; read their source yourself and decide whether the pitch needs a sharper sentence.
- [ ] Fill in the "Team review" line in `docs/AI-USE.md` with what you actually reviewed by hand.
- [ ] Decide the licence (the repo has none yet) and add `LICENSE` if you want one.
- [ ] Funds: the relayer holds only a small WBT balance; do not top it up beyond what you need.

## 4. Submit

1. ETHGlobal dashboard: repo link (https://github.com/isithore002/Truce), video link, short description (copy the first paragraph of the README).
2. **Select Whitechain** as the prize track (one Whitechain prize per project).
3. Paste the explorer links from the README for the verified contract, a real settlement and the swapped-payout rejection.
4. Submit before 09:00 IST on Nov 7. The autonomous run did **not** submit anything.
