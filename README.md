# Truce

> Work in progress for ETHGlobal Mumbai 2026 (Whitechain, Operate track). This README is a stub; the final version (setup, architecture, limitations, why onchain) is written at the end of the build.

Invoices a buyer can verify before paying, collected on the due date, paid gaslessly in USDT on Whitechain Sepolia (chain 1874).

- Scope and decisions: [docs/SPEC.md](docs/SPEC.md)
- Evidence and adoption plan: [docs/MARKET-RESEARCH.md](docs/MARKET-RESEARCH.md)
- Whitechain feedback: [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md)
- How AI was used: [docs/AI-USE.md](docs/AI-USE.md)

## Live on Whitechain Sepolia (chain 1874, testnet)

- `InvoiceSettler` (verified): [0xB1e1c081D5FB009D8f908b220D902E9F98dfbFE7](https://explorer.testnet.whitechain.io/address/0xB1e1c081D5FB009D8f908b220D902E9F98dfbFE7). Record: [deployments/whitechain-sepolia.json](deployments/whitechain-sepolia.json).
- One real settlement in the track USDT (0.01 USDT, example invoice, gas paid by the relayer in WBT): [transaction](https://explorer.testnet.whitechain.io/tx/0xed25b41a14fa7395caf5af91d32dc355c97b59975feecad5e0caea80a7c088fb). The buyer's USDT went to the contract and straight out to the payout wallet the merchant signed; the transaction shows `AuthorizationUsed` and `InvoicePaid`.
- The same buyer authorization with a swapped payout wallet is rejected by the contract (`BadMerchantSignature`). Reproduce both with `npm run e2e` (needs your own throwaway testnet keys, see `.env.example`).

Status: see the checklist in [CLAUDE.md](CLAUDE.md). Testnet only, example data only, no real users.
