// Example merchant app (EXAMPLE DATA: a fictional studio bills a fictional client).
// Run: CHAIN_MODE=mock DEMO_DOMAINS=1 npm run server, then: npm run start -w @truce/merchant-demo
// The merchant key comes from MERCHANT_PK (a throwaway testnet key) and must be the wallet the domain publishes.
import { privateKeyToAccount } from "viem/accounts";
import { createInvoice } from "@truce/sdk";

// --- integration start (this is what a merchant app adds)
const { link, hash } = await createInvoice({
  apiBase: process.env.API_URL ?? "http://127.0.0.1:8787",
  signer: privateKeyToAccount(process.env.MERCHANT_PK as `0x${string}`),
  domain: "northlight-design.example",
  merchantName: "Northlight Design Studio",
  clientName: "Beta Labs",
  lineItems: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: "0.01" }],
  example: true,
});
console.log(`Send this link to your client: ${link}\nInvoice hash: ${hash}`);
// --- integration end
