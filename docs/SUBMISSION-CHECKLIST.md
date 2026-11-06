# Submission checklist (human steps)

Deadline: **Sat 2026-11-07 09:00 IST** (aim to submit by 08:00). The autonomous build did everything that could be done without a browser or your accounts. These steps are yours. Status of the build: `docs/AUDIT.md`.

## 1. Click through the app once (about 15 minutes)

Nobody has seen the screens in a real browser with a wallet extension. Do this before recording, and fix or cut whatever misbehaves.

**Use server mode, not the default.** The web app starts in `VITE_API_MODE=mock`: scripted scenarios, a pretend wallet, no server, no chain. Anything recorded that way is not real. Create `apps/web/.env.local` with:

```
VITE_API_MODE=server
VITE_API_BASE=http://localhost:8787
```

Terminal 1 (real testnet; use `CHAIN_MODE=mock` instead if you only want to look):
```bash
CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server
```
Terminal 2: `npm run dev -w apps/web`, then open **http://localhost:5173** (type `localhost`, not `127.0.0.1`: the server's CORS allows exactly that origin) in a browser with MetaMask or Rabby. Restart Vite after editing `.env.local`.

Needs for the new steps: step 11 uses the payout wallet's USDT (it holds a small amount from earlier test payments; a refund only moves back what was paid), and step 12 starts a small server that holds `MERCHANT_PK`, so it listens on 127.0.0.1 only.

Optional pre-check that needs no browser (mock chain, port 8790): `DEMO_DOMAINS=1 PORT=8790 npm run server`, then `npm run smoke:web`. It runs the web app's own client against the server: create, get, verify, pay now, list, CSV, swapped-payout FAIL, pay on the due date, cancel.

Wallets: the merchant page signs with the **example merchant wallet** `0x19d4...51Dc` (import the MERCHANT_PK key into the wallet), the buyer pays with `0xB17a...a28E` (import PAYER_PK). Use a separate browser profile for each, or switch accounts.

| # | Do this | Expect |
|---|---|---|
| 1 | Home page loads | EXAMPLE DATA banner; no scenario switcher bar (that bar means you are still in mock mode) |
| 2 | `/setup` -> connect the merchant account, then press **Check my domain** | Wallet asks to connect; domain `northlight-design.example` and payout = the signing wallet; "Download truce.json" works. The check says **"Your domain is set up."** for the example merchant wallet, and **"Not set up yet."** with the wallet the file lists if you connected another wallet. With any other wallet and a fictional name (for example `my-studio.example`), the check says no file is registered and offers **Register this demo domain**; one click publishes it on the demo server and the check runs again by itself (the wallet on the built-in `northlight-design.example` cannot be changed; the page offers a different name). For your own real domain it reads `https://<domain>/.well-known/truce.json` live (no redirects; a slow host can time out at 3 s) |
| 3 | `/merchant` -> fill client name, one line item, a due date -> "Sign and create invoice" | Wallet shows a typed-data signature (no gas); a pay link appears, with a notice above it. With the example merchant it says **"Your buyer will see PASS"** (10 of 10 checks). With a domain you do not control (for example `acme.com`) or the wrong wallet it says **"Your buyer will see FAIL, so do not send this link yet"**, lists the failing checks and what to change |
| 4 | Open the link in the buyer profile (`/pay/...`) | Big PASS, ten checks, full payout wallet shown |
| 5 | Connect the buyer wallet | Chain 1874 is added or switched to |
| 6 | Pay now (keep `/merchant` open in a second window) | One signature prompt (no gas), progress, then paid with an explorer link and a "Network fee" row saying the relayer paid. In the second window the row flashes green and flips to Paid within about 4 seconds, without a reload |
| 7 | `/demo` -> build the swapped-payout link and open it | Big FAIL, the failing checks highlighted, Pay disabled |
| 8 | `/merchant` dashboard | The row shows Paid with a transaction link; "Download CSV" and "Download ledger" each download a file that opens in a spreadsheet. After step 11 (refund) the CSV row shows the refunded and net-received amounts, and the ledger has issued, payment and refund rows, each payment and refund with a working explorer link |
| 9 | `/merchant`: keep "Mark as EXAMPLE DATA" on, type **2** in "Demo: due in N minutes", sign. Open the link as buyer, choose "On the due date", sign | "Scheduled" with a due time like "6 Nov 2026, 09:12 UTC", then the scheduler collects it about 2 minutes after you created it. Use 2 to 3 minutes: the buyer must sign before the due time, and two wallet prompts take a while. Not tried with a due time that has already passed |
| 10 | New invoice with a **future** due date (leave the minutes field empty, pick tomorrow), schedule it, press "Cancel scheduled payment" | Cancelled |
| 11 | `/merchant` -> open the paid invoice -> Refund. Connect the payout wallet (the merchant account), amount `0.005`, "Sign and send refund" | One signature prompt (no gas). "Refunded so far" and "Left to refund" update, a "Partly refunded" badge appears, History lists the refund with an explorer link, and the buyer wallet receives the USDT. Try an amount above what is left: a plain refusal, nothing sent |
| 12 | Third terminal: `npm run shop -w @truce/merchant-demo`, open http://127.0.0.1:8800, press "Invoice me" on a service | A pay link appears within a few seconds (needs `MERCHANT_PK` in `.env`). Opening it shows PASS and the service name. The banner says EXAMPLE DATA |
| 13 | `/merchant` create form: set "Number of invoices" to `3` (leave the demo minutes empty), sign three times | Three links, due one month apart, notes ending "Invoice 1 of 3" and so on. If you reject the second signature, the first link is kept and the page says "Created 1 of 3" |

The Soul badge ("Individual KYC-verified on WhiteBIT (demo data, mocked)") should appear on example invoices only.

Optional, to see the payee-changed warning: after step 6, add a second wallet to `payoutAddresses` in `fixtures/domains/northlight-design.example.json`, restart the server, set that wallet as the payout wallet on `/setup`, create a new invoice and open it in the same browser as the buyer.

Write down anything that looks wrong. The README already says the click-through is a manual check.

## 2. Record the video (2 to 4 minutes)

Shot list and wording: `docs/VIDEO-SCRIPT.md` (pre-flight list, shots, what to say; it replaces the drain-the-wallet scene in `docs/design/E-SUBMISSION.md` section 2, which was never run live). Must show each party (merchant, buyer, relayer, verifier), the swapped-payout FAIL in the app, and the swapped-payout revert (`npm run e2e -- --attack-only` prints it). Say on screen and aloud that the data is **example data** and the due date is **time-compressed**. 720p or higher, your own voice, no speed-up. Keep a spare take of the attack and the payment. Record in server mode only (step 1).

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
