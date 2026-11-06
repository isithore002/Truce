# @truce/sdk: create a verifiable invoice from your own server

A merchant app adds one call. It builds an invoice, signs it with the merchant's wallet (EIP-712), registers it with a Truce server and gets back the link to send to the buyer. The buyer's page then checks the invoice against the wallet list the merchant publishes on their own domain, and shows PASS or FAIL before anything is paid.

## The integration (9 lines)

This is the whole Truce part of the example storefront, [examples/merchant-demo/shop.ts](../examples/merchant-demo/shop.ts):

```ts
import { privateKeyToAccount } from "viem/accounts";
import { createInvoice } from "@truce/sdk";

const { link, hash } = await createInvoice({
  apiBase: process.env.API_URL ?? "http://127.0.0.1:8787",
  signer: privateKeyToAccount(process.env.MERCHANT_PK as `0x${string}`),
  domain: "northlight-design.example",
  merchantName: "Northlight Design Studio",
  clientName: "Beta Labs",
  lineItems: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: "0.01" }],
  example: true,
});
// send `link` to the client; `hash` identifies the invoice
```

`npm run count:sdk-lines` counts the lines between the integration markers in the example files (the limit we set is 20).

## API

- `createInvoice(options)` returns `{ link, hash }`. It reads the server's chain settings, builds the invoice, signs it, registers it, and throws `TruceError` with code `HASH_MISMATCH` if the server returns a different hash than the one signed.
  - `apiBase`: the Truce server URL.
  - `signer`: any object with an `address` and `signTypedData` (a viem account, or a wallet-backed signer). It must be the signing wallet the domain publishes.
  - `domain`: the domain that serves `/.well-known/truce.json`.
  - `merchantName`, `clientName`, `lineItems`: each item has `description`, a whole-number `quantity` as text, and `unitPrice` in USDT as text (for example `"625.00"`).
  - Optional: `payout` (defaults to the signing wallet), `notes`, `dueDate` (unix seconds; omit for "on receipt"), `validDays` (how long the invoice stays payable, default 30), `payer` (only this wallet may pay), `example` (shows the EXAMPLE DATA banner).
- `invoiceStatus(apiBase, hash)` returns `{ status, txHash? }`, for example `ISSUED` or `PAID`.

## What has to be true for the buyer to see PASS

1. The domain publishes `/.well-known/truce.json` listing the signing wallet and the payout wallet (the app's Setup page generates the file).
2. The invoice is signed by that signing wallet and pays one of the listed payout wallets.

If either is missing, the buyer's check shows FAIL, and the contract would refuse a payment to a wallet the merchant did not sign. The merchant also sees the verdict right after creating an invoice in the web app.

## Limits

- Amounts, payer, payout and merchant are public on chain. Invoice details are stored unencrypted on the Truce server.
- The signing key stays with you: the SDK signs locally and sends only the signed invoice.
- Testnet only (Whitechain Sepolia, chain 1874). The contract is not audited.
- Tests: `npm test -w @truce/sdk` (4 tests, routed into the server app).
