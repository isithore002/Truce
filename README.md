# Truce

Invoices a buyer can verify before paying, collected on the due date, paid gaslessly in USDT on Whitechain Sepolia (chain 1874, testnet).

Built for ETHGlobal Mumbai 2026, Whitechain **Operate** track. Testnet only. All example data is fictional and labelled **EXAMPLE DATA**: "Northlight Design Studio" bills "Beta Labs" (time-compressed in the demo).

## The idea in one minute

1. A merchant publishes `/.well-known/truce.json` on their own website: the wallet that signs their invoices and the wallets they get paid at.
2. The merchant signs each invoice (EIP-712) and sends the link.
3. The buyer page checks the invoice against that file and shows **PASS or FAIL** before anything is paid.
4. The buyer signs **one** EIP-3009 `receiveWithAuthorization`, either to pay now or valid from the due date. A relayer pays the gas in WBT.
5. Our contract `InvoiceSettler` verifies the merchant's signature and pays **only the payout wallet the merchant signed**. Each invoice settles once. Capped refunds go only to the original payer.

**The attack we show:** someone swaps the payout wallet in an invoice (an email, a link, a compromised page). The app shows **FAIL** and disables Pay, and if the same buyer authorization is sent to the contract with the swapped wallet, the contract **reverts** (`BadMerchantSignature`). The second line of defence does not depend on the app, the server or the relayer behaving.

## Live on Whitechain Sepolia (chain 1874, testnet)

- `InvoiceSettler` with capped refunds (verified): [0xCbe41B98D2333a1BD92d51Fbb6FE668c5170ff9d](https://explorer.testnet.whitechain.io/address/0xCbe41B98D2333a1BD92d51Fbb6FE668c5170ff9d). Record: [deployments/whitechain-sepolia.json](deployments/whitechain-sepolia.json). The first deployment ([0xB1e1...fE7](https://explorer.testnet.whitechain.io/address/0xB1e1c081D5FB009D8f908b220D902E9F98dfbFE7), settle only) stays on chain and is listed as `previous` in that record.
- Settlement in the track USDT (0.01 USDT, example invoice, gas paid by the relayer in WBT): [transaction](https://explorer.testnet.whitechain.io/tx/0xd34ac0c27f31e7c5c87d25a6fc6e9e6f403400cb309a65489c851ef0a526efed). The buyer's USDT went to the contract and straight out to the payout wallet the merchant signed. Reproduce with `npm run e2e`.
- The same buyer authorization with a swapped payout wallet is rejected by the contract. `npm run e2e -- --attack-only` shows it and sends nothing.
- The same payment through the HTTP API (create, verify, swapped-payout copy refused, one buyer signature, status, CSV): [transaction](https://explorer.testnet.whitechain.io/tx/0x992913567d1337f578208ae0364166d5e41cba416bc821cf68dec3bc126516b9) (`npm run e2e:api`).
- **Pay on the due date, collected by the scheduler:** [transaction](https://explorer.testnet.whitechain.io/tx/0xe4f4df28c0df800c7ee89df1ea671c6129e6165773a93ba521deaeb69a0e6882). **Buyer cancel**, signed by the buyer and relayed: [transaction](https://explorer.testnet.whitechain.io/tx/0xe8fce82e8453c9c1f6d6b1d5177294ac9996ba3b1c34c63fa4e822af1b873c2a) (`npm run e2e:due`). The due date in this run was about 70 seconds away (time-compressed).
- **Capped refund** on the real USDT (`npm run e2e:refund`): payment [transaction](https://explorer.testnet.whitechain.io/tx/0xf294501133d5996591cf326f04601ca049f625ef94fefe29a0fd3c875f6c148a), then 0.005 USDT refunded to the original payer, signed by the payout wallet: [transaction](https://explorer.testnet.whitechain.io/tx/0x9e15507d2c58df4f3fbd668e6be096cc7589d00ecac306e037b5660d22ee2e79). A refund above the remaining amount is rejected by the contract.
- **Refund through the API and the dashboard** (`npm run e2e:api`, which now ends with a refund): payment [transaction](https://explorer.testnet.whitechain.io/tx/0x9b378a38ee8a37ef5231f765575297db205c18b40f0b55a446a51a984d8ce281), then 0.002 USDT of the 0.01 USDT returned to the buyer through `POST /api/invoices/:hash/refund`, signed by the payout wallet and sent by the relayer: [transaction](https://explorer.testnet.whitechain.io/tx/0x816e2a2bbce17c723c46d340a92dc1a2142c41bd0a7314775847c92fc6d34605). The explorer shows the payout wallet to the contract to the buyer, 0.002 USDT each way, and a refund above what is left is refused with `REFUND_EXCEEDS_PAID`.

## What is in the app

| Page | What it does |
|---|---|
| `/merchant` | Connect a wallet, generate the `truce.json` to publish and check that it is live on your domain, create and sign invoices, see status (awaiting, scheduled, at risk, paid, failed, cancelled), download two accountant files: a CSV with one row per invoice (including `refunded` and `net_received`) and a **ledger** with one row per money movement (issued, payment, refund), each payment and refund with its explorer link. The list refreshes every few seconds and flashes a row when its status changes. Open an invoice to **refund** it, in full or in part (the payout wallet signs; the money goes only to the wallet that paid). An optional field makes a series of separate monthly invoices (not a subscription). For example data, a demo field makes an invoice due in a few minutes. |
| `/pay/<hash>` | The buyer page: ten plain-language checks and a big PASS or FAIL, the full payout wallet, a payee-changed warning if the merchant's wallets differ from what this browser saw on a previous payment, pay now or on the due date, cancel a scheduled payment. The receipt shows the network fee and who paid it, read from the explorer for that transaction. |
| `/verify` | Public check, no wallet: paste a link, a hash or the invoice JSON. Shows PASS or FAIL and whether it was paid on chain. A demo button swaps the payout wallet to show the FAIL. |

SDK for a merchant app ([sdk/README.md](sdk/README.md)): `createInvoice({ apiBase, signer, domain, merchantName, clientName, lineItems })` returns `{ link, hash }`. The example app [examples/merchant-demo/invoice.ts](examples/merchant-demo/invoice.ts) needs **10 lines** of integration code (counted by `npm run count:sdk-lines`; the limit we set is 20). A visible version of the same integration is the fictional studio's website, [examples/merchant-demo/shop.ts](examples/merchant-demo/shop.ts): an "Invoice me" button calls its server, which creates a signed Truce invoice in **9 lines** and returns the pay link (`npm run shop -w @truce/merchant-demo`, then open http://127.0.0.1:8800).

## Run it

Needs Node 22+, npm, and (for the contract) [Foundry](https://getfoundry.sh). On Windows use Git Bash for Foundry.

```bash
git clone --recurse-submodules https://github.com/isithore002/Truce.git && cd Truce
npm install
npm run test:all                      # lib, server, web, sdk and Foundry tests

# Demo with no keys and no network: a mock chain and the fictional example merchant
DEMO_DOMAINS=1 npm run server         # terminal 1: API on http://127.0.0.1:8787 (mock chain)
npm run dev -w apps/web               # terminal 2: web app on http://localhost:5173 (default: scripted mock mode, no server)
# To use the real API instead, put VITE_API_MODE=server in apps/web/.env.local and restart (open it as localhost:5173)
npm run start -w @truce/merchant-demo # needs MERCHANT_PK in .env (see below); prints a pay link
```

Against the real testnet, copy `.env.example` to `.env`, fill in **throwaway** testnet keys (never a key that held real funds), fund the buyer with test USDT (swap WBT on YetiTrade) and the relayer with WBT (faucet), then:

```bash
CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server
npm run e2e -- --attack-only          # swapped payout rejected by the contract, sends nothing
npm run e2e                           # one real 0.01 USDT settlement
npm run e2e:api                       # the same through the HTTP API
npm run e2e:due                       # pay-on-due-date collected by the scheduler, plus a buyer cancel
npm run e2e:refund                    # settle, then a capped refund to the original payer
```

The chain module refuses to send on any chain other than 1874. Keys are read from `.env` and never printed.

## Architecture

```
contracts/            InvoiceSettler (Solidity 0.8.30, evm prague, OpenZeppelin v5) + Foundry tests
packages/invoice-lib/ EIP-712 invoice, hashes, signing, ten-check verify pipeline, EIP-3009 builders (TypeScript)
apps/server/          Fastify API, JSON-file store, SSRF-guarded domain-file fetch, chain module (viem or mock), due-date scheduler
apps/web/             React app: merchant, buyer, public verify
sdk/, examples/       merchant SDK and the 10-line example app
scripts/              end-to-end scripts that run against the live testnet
docs/                 spec, design, decisions log, audit
```

The invoice hash is the EIP-712 digest of the invoice, the EIP-3009 nonce and the settlement key at once, so one signature from the buyer is bound to exactly one invoice. The TypeScript and Solidity hashes are checked against shared golden vectors.

## Read it like an accounts-receivable module

The parts line up with the usual ERP-style layers: master data (merchant setup, `truce.json`, the token allowlist), documents (the signed invoice, the buyer's payment authorization, the refund), processes (verification, settlement, collections, cancellation, refund), records (the event history and the on-chain payment record) and reports (dashboard, CSV, public verify page). The on-chain record plays the part of the bank statement in a three-way match with the signed invoice and the buyer's authorization. This is a way to read the structure, **not an ERP and not an ERP integration**: there are no users, roles or approvals. The mapping, with file locations, is in [docs/design/G-ERP-STYLE-VIEW.md](docs/design/G-ERP-STYLE-VIEW.md).

## Why on chain

The domain file and the PASS/FAIL check are for the buyer's eyes. They do not help if the buyer is rushed, the page is spoofed, or the server is wrong. The contract enforces the payee from the merchant's signature at the moment money moves, whoever submits the transaction. It also settles each invoice once, and anyone can read `payments(hash)` to confirm a payment without trusting our server. A payment page alone cannot show that.

### Why a stablecoin on chain, and not a bank transfer

For a buyer and a merchant who already hold USDT (crypto-native companies, DAOs and the agencies that bill them), a bank transfer means converting out and back, waiting for banking hours, and trusting a payee check that only the banks see. Settling in the USDT they hold takes one signature and no gas for the buyer, and both sides can check the payment against a public record. The payee rule is also enforced by code when the money moves, not by a process around it. A due-date collection is a signed authorization the buyer can cancel on chain.

Limits: this fits only parties who already hold stablecoins, we have no adoption data, and Truce does not replace bank rails. For buyers without stablecoins a bank transfer is the better choice.

## Tests

- Foundry (49): settle, swapped payout, tampered amount, wrong signer, expiry, double settle, payer lock, fee-on-transfer token, ERC-1271 merchant, pause, golden vectors shared with TypeScript, fuzz and invariants, capped refunds.
- Library (74), server (205, including a fake-clock scheduler suite, SSRF tests, the refund route, the ledger, the RPC fallback and the domain check and the demo-domain registry), web (97, plus 11 opt-in smoke tests that run the web client against a live server: `npm run smoke:web`), SDK (4), demo storefront (8).
- Live scripts above, each recorded with explorer links.

## Overlap with other entries

Other entries on the same testnet also do merchant-signed invoices, EIP-3009 pulls and refunds (for example `PaymentRouter`, `PaymentProcessor`, `Checkout`). At least one (`MerchantRegistry` `0xF6B6...6C47`) records domain verification through a platform attestor after an off-chain DNS or .well-known check. Truce's difference is where that trust sits: the buyer's own check reads the merchant's published file directly with no platform in between, and the contract enforces the signed payout wallet at settlement. We read other teams' contracts only to assess overlap; ours was written from scratch. Competitor scan run on 2026-11-06 with `npm run radar`.

## Limitations (please read)

- **A signed authorization is a commitment, not locked funds.** On the due date the buyer's balance may be too low; then the collection fails and the invoice shows Failed. The balance and health check is a **snapshot, not a lock**.
- **Testnet only, example data only, no real users.** No mainnet transaction was made. The contract is not audited. The track USDT is an upgradeable proxy with a blocklist function, so its behaviour is up to its issuer.
- **Invoices are not private.** Truce checks who you are paying; it does not hide the invoice. Merchant, payer, payout and amount are public on chain. The invoice text (client name, line items, notes) is stored unencrypted on our server, and only its hash is on chain. Anyone with an invoice link, or access to the server, can read it. A leaked link exposes the details, not the funds: the payout is fixed by the merchant's signature. Reading restricted to a wallet, and stealth recipient addresses, are not built (stealth is listed as a later phase in [docs/SPEC.md](docs/SPEC.md)).
- **The domain file is the trust anchor.** A lookalike domain, or a domain taken over before the first payment, is not detected. Key pinning helps only afterwards, and pins live in one browser's localStorage (a new browser starts with none). DNSSEC is not checked.
- **Off-chain signature checks support EOA merchant wallets.** The contract also accepts ERC-1271 contract wallets, but the app's PASS/FAIL cannot verify those. Buyers sign with `v, r, s`, so contract-wallet buyers are not supported.
- **No merchant login.** Anyone who knows a merchant's signing address (it is public in `truce.json`) can list that merchant's invoices and download the CSV. Invoice links are unguessable hashes, but the merchant list is not private in this build.
- **RPC reads fall back to a backup node; sending does not.** Simulation, receipts and balance reads try the primary RPC and then the documented backup (`RPC_FALLBACK_URL`, default `https://rpc.ankr.com/whitechain_testnet`, `none` to turn it off). A transaction is only ever sent through the primary, so a send that timed out is not offered to a second node. If the primary is down, payments wait or fail rather than being sent elsewhere.
- **One relayer, one server.** A single relayer key with a daily WBT budget and a per-IP rate limit; invoices are kept in a JSON file; the due-date scheduler runs inside the server process. If the server is down at the due time it catches up on restart, until the authorization expires.
- **Refunds need the payout wallet to sign and to hold the USDT.** It must be an ordinary wallet (the refund is an EIP-3009 authorization), and the amount comes out of that wallet at refund time. A refund can only go to the wallet that paid, and never above the amount paid. The dashboard list does not show a "refunded" badge yet; the refund panel in the invoice drawer reads the amount from the chain.
- **The ledger and the CSV are exports, not accounting software.** The ledger has four illustrative accounts (accounts receivable, sales revenue, cash in USDT, sales returns) and no tax, write-offs or period closing. Refunds in both files come from the refunds this server recorded; a refund sent some other way (a script straight to the contract) is not in them, and the chain remains the source of truth. A cancelled authorization, a failed collection or an expiry moves no money, so it has no ledger row; it stays in the invoice's history. A rejected swapped-payout copy is never stored, so it appears in neither file.
- **A monthly series is only a faster way to create invoices.** Each one is signed, paid and (optionally) scheduled on its own. Nothing recurs by itself, and nothing is charged without the buyer's own signature for that invoice.
- **The Soul badge is mocked.** It shows "Individual KYC-verified on WhiteBIT (demo data, mocked)" for the example merchant, in example mode only. WB Soul's verified flag reflects one individual's personal KYC and says nothing about a business. No real Soul data is read.
- **Interactive wallet screens** (connect, add chain, sign) are covered by component tests, API tests and the chain scripts; the full click-through in a browser with a wallet extension is a manual check, listed in [docs/SUBMISSION-CHECKLIST.md](docs/SUBMISSION-CHECKLIST.md).
- Not built: stealth addresses, webhooks, approvals, ERP integrations (CSV export only), mainnet.

## More

- Scope and decisions: [docs/SPEC.md](docs/SPEC.md), [docs/DECISIONS-LOG.md](docs/DECISIONS-LOG.md)
- Design and API: [docs/design/00-INDEX.md](docs/design/00-INDEX.md), [docs/INTERFACES.md](docs/INTERFACES.md)
- Evidence and adoption plan: [docs/MARKET-RESEARCH.md](docs/MARKET-RESEARCH.md)
- Whitechain feedback: [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md)
- How AI was used: [docs/AI-USE.md](docs/AI-USE.md)
- Audit of this build: [docs/AUDIT.md](docs/AUDIT.md)
