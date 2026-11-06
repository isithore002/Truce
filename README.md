# Truce

> Work in progress for ETHGlobal Mumbai 2026 (Whitechain, Operate track). This README is a stub; the final version (setup, architecture, limitations, why onchain) is written at the end of the build.

Invoices a buyer can verify before paying, collected on the due date, paid gaslessly in USDT on Whitechain Sepolia (chain 1874).

- Scope and decisions: [docs/SPEC.md](docs/SPEC.md)
- Evidence and adoption plan: [docs/MARKET-RESEARCH.md](docs/MARKET-RESEARCH.md)
- Whitechain feedback: [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md)
- How AI was used: [docs/AI-USE.md](docs/AI-USE.md)

## Live on Whitechain Sepolia (chain 1874, testnet)

- `InvoiceSettler` with capped refunds (verified): [0xCbe41B98D2333a1BD92d51Fbb6FE668c5170ff9d](https://explorer.testnet.whitechain.io/address/0xCbe41B98D2333a1BD92d51Fbb6FE668c5170ff9d). Record: [deployments/whitechain-sepolia.json](deployments/whitechain-sepolia.json). The first deployment ([0xB1e1...fE7](https://explorer.testnet.whitechain.io/address/0xB1e1c081D5FB009D8f908b220D902E9F98dfbFE7), settle only) stays on chain and is listed as `previous` in that record.
- A settlement in the track USDT (0.01 USDT, example invoice, gas paid by the relayer in WBT): [transaction](https://explorer.testnet.whitechain.io/tx/0xd34ac0c27f31e7c5c87d25a6fc6e9e6f403400cb309a65489c851ef0a526efed). The buyer's USDT went to the contract and straight out to the payout wallet the merchant signed. Reproduce with `npm run e2e` (needs your own throwaway testnet keys, see `.env.example`).
- The same buyer authorization with a swapped payout wallet is rejected by the contract (`BadMerchantSignature`). `npm run e2e -- --attack-only` shows it and sends nothing.
- The same payment driven through the HTTP API (create, verify, swapped-payout copy refused, one buyer signature, status, CSV): [transaction](https://explorer.testnet.whitechain.io/tx/0x992913567d1337f578208ae0364166d5e41cba416bc821cf68dec3bc126516b9). Run `CHAIN_MODE=testnet DEMO_DOMAINS=1 npm run server`, then `npm run e2e:api`.
- A capped refund on the real USDT (`npm run e2e:refund`): payment [transaction](https://explorer.testnet.whitechain.io/tx/0xf294501133d5996591cf326f04601ca049f625ef94fefe29a0fd3c875f6c148a), then 0.005 USDT refunded to the original payer, signed by the payout wallet: [transaction](https://explorer.testnet.whitechain.io/tx/0x9e15507d2c58df4f3fbd668e6be096cc7589d00ecac306e037b5660d22ee2e79). A refund above the remaining amount is rejected by the contract. There is no refund screen in the app: refunds are contract and script only.

Status: see the checklist in [CLAUDE.md](CLAUDE.md). Testnet only, example data only, no real users.
