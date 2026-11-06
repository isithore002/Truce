// Example merchant website (EXAMPLE DATA: a fictional studio bills a fictional client).
// Run: CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server, then: npm run shop -w @truce/merchant-demo, then open http://127.0.0.1:8800
// The merchant key comes from MERCHANT_PK (a throwaway testnet key) and must be the wallet the domain publishes.
// This server holds that key, so it listens on 127.0.0.1 only. It is a demo, not a production shop.
import { privateKeyToAccount } from "viem/accounts";
import { createInvoice } from "@truce/sdk";
import { createShop } from "./shopServer.js";

if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.MERCHANT_PK ?? "")) throw new Error("MERCHANT_PK is missing or not a 32-byte hex key (see .env.example)");

const shop = createShop(async (item, clientName) => {
  // --- integration start (this is all the Truce code the studio's server needs)
  const { link, hash } = await createInvoice({
    apiBase: process.env.API_URL ?? "http://127.0.0.1:8787",
    signer: privateKeyToAccount(process.env.MERCHANT_PK as `0x${string}`),
    domain: "northlight-design.example",
    merchantName: "Northlight Design Studio",
    clientName,
    lineItems: [{ description: `${item.name} (EXAMPLE DATA)`, quantity: "1", unitPrice: item.price }],
    example: true,
  });
  // --- integration end
  return { link, hash };
});

const port = Number(process.env.SHOP_PORT ?? 8800);
shop.listen(port, "127.0.0.1", () => console.log(`Northlight shop on http://127.0.0.1:${port} (invoices go to ${process.env.API_URL ?? "http://127.0.0.1:8787"})`));
