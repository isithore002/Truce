# Architecture

## Pieces and responsibilities (module boundaries; one developer builds all of it)

```
 Merchant browser            Buyer browser               Anyone (no wallet)
 apps/web /merchant      apps/web /pay/:hash     apps/web /verify
        \                          |                          /
         \----------- HTTPS -------+-------------------------/
                                   v
                  apps/server  src/api    REST, invoice store, domain-file check, CSV
                                   |  Store interface (shared/store.ts)
                                   v
                  apps/server  src/chain  relayer: settle, health check, scheduler, budget/rate limit
                                   |  viem
                                   v
        Whitechain Sepolia (1874):  InvoiceSettler  ->  track USDT (EIP-3009)
                                   ^
        packages/invoice-lib: EIP-712 types, hash, sign/verify, domain-file check, golden vectors
        sdk/: createInvoice(), used by examples/merchant-demo = the "~20 lines" demo app
```

## Responsibilities
| Piece | Does | Does NOT do |
|---|---|---|
| `contracts/` | Verifies merchant signature, pulls via `receiveWithAuthorization`, pays only the signed payout, settles once, capped refund | Anything off-chain; domain checks |
| `packages/invoice-lib/` | Single definition of the invoice type, hash and signing; domain-file fetch/verify logic; PASS/FAIL result type | Network calls to our server; UI |
| `apps/server/src/chain` | Simulate and send txs, due-date scheduler, health checks, WBT budget, rate limit | HTTP routes, storage schema |
| `apps/server/src/api` | REST endpoints, invoice store, server-side domain-file fetch (CORS), CSV export. Create checks the merchant signature only; the domain-file check runs in verify, which is what the buyer page shows as PASS/FAIL | Sending transactions (calls the chain module); webhooks (out of scope, not built); key pinning (browser only) |
| `apps/web` | Merchant dashboard and setup page, buyer page (PASS/FAIL, sign, pay now or on the due date, cancel), public verify page. Talks to the server through one interface with two adapters: `VITE_API_MODE=server` (real HTTP) or `mock` (default, scripted scenarios, no network) | Hashing logic (uses invoice-lib); holds no key, sends no transaction |
| `sdk/` + `examples/merchant-demo` | ~20-line merchant integration and the separate demo app | Chain logic |

## Where data lives
- **On chain:** payment record keyed by invoice hash, payer, payout, amount, refunded; events `InvoicePaid`, `Refunded`.
- **Off chain (our server):** the invoice document (line items, names), buyer authorization until it is settled, status and health history.
- **On the merchant's domain:** `/.well-known/truce.json` (signing wallet, payout wallets).
- **In the buyer's browser:** key pinning (domain -> signing wallet, payout wallet).

## Modes (so nobody blocks anybody)
`CHAIN_MODE=mock` (default for B): the chain module returns scripted results, no keys, no network.
`CHAIN_MODE=testnet`: real Whitechain Sepolia. `DEMO_DOMAINS=1`: fictional `*.example` merchant domains are served from local fixtures (labelled EXAMPLE DATA); real domains are fetched over HTTPS.
Web app: **`VITE_API_MODE=mock` is the default.** In that mode the pages never contact the server or the chain. Set `VITE_API_MODE=server` (and `VITE_API_BASE`, default `http://localhost:8787`) in `apps/web/.env.local` for anything real, including the demo video. Open the app as `http://localhost:5173`: the server's CORS allows exactly `WEB_ORIGIN` (default that origin), so `127.0.0.1:5173` is blocked.

## Trust boundaries (what an attacker or a bug cannot do)
- Our relayer or server cannot redirect money: the contract pays the payout inside the merchant-signed invoice, and the buyer's signature fixes token, amount, destination (the contract) and nonce.
- A swapped payout fails twice: the buyer app shows FAIL (domain file mismatch) and the contract reverts (signature mismatch).
- The server is trusted only for availability and for storing off-chain details; anyone can recompute hashes and read chain state.
