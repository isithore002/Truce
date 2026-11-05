# Booth notes (Whitechain team member), 2026-11-05

These are one person's opinions, not data or official positions.

## Round 1: Soul questions
We asked: Will Soul deploy to testnet? Is business verification (KYB) planned? Who holds the registry key long-term? Is `PaymentRouter` a Whitechain reference?
Their reply:
- Unknown whether Soul reaches Sepolia, so do not wait. Keep the whole demo on testnet and **mock the Soul data, labelled as mocked.** Testnet has solid RPC; anything beyond reads on mainnet means real WBT.
- KYB is planned, no timeline. Today `IsVerified` reflects **personal KYC**, so the badge must not imply WhiteBIT verified the business.
- Owner key: no answer yet (not a blocker since the data is mocked).
- `PaymentRouter` is probably another team's entry (deployed today from a new wallet). Do not build on it.

## Round 2: feedback on the idea
- Due-date collection makes sense for **B2B invoices with payment terms**, less for one-off purchases.
- The weak spot is that **funds are not locked**: merchants want to know early if collection might fail. Add a **balance check before the due date** and a **clear failed state**.
- For the demo, show the **FAIL case with a swapped payout wallet** ("your best moment").
- They cannot connect us with a real merchant: make one up (a small design agency billing a client on 30-day terms) and label it as an example.

## What we did with it
See `SPEC.md` section 12 and `DECISIONS-LOG.md`: health check + Failed state, swapped-payout FAIL as hero, "Northlight Design Studio" / "Beta Labs" example with an EXAMPLE DATA banner, Soul mocked and worded as individual KYC.

## Still open (asked, not answered)
- Does signed `cancelAuthorization` work on the track USDT? (`gate/gate1.mjs --cancel` tests it.)
- Faucet drip: docs 0.5 WBT per 24h vs the flyer's 2 WBT a day.
- Soul registry owner key long-term.

## Messages we sent
- Reply thanking them: demo on testnet only, mock and label Soul, badge wording "Individual KYC-verified on WhiteBIT (demo data, mocked)", no mainnet transactions, PaymentRouter noted, plus the two open questions above.
- Idea summary DM: SealedInvoice (our working name then; the project is now called Truce) (Operate), verify before paying, collected on the due date, gasless in USDT, limits stated (testnet only, no real users, public amounts and addresses, signature is a commitment not locked funds).

## Event logistics (from the flyer)
Workshop Thu Nov 5, 4:30 pm IST, Room 2. Help on Telegram `t.me/Whitechaindevs`. Free Ankr RPC code `Whitechain2026`. Submit by Nov 7, 9:00 IST, selecting Whitechain in the ETHGlobal dashboard (one Whitechain prize per project). Builders Program: whitechain.io/builders.
