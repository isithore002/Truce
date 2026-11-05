# Pitch, demo and judge Q&A (v2, honest version)

## 30-second opening
"A supplier emails: 'same invoice, but our bank details changed.' The buyer pays, and the money goes to a criminal. The FBI reportedly logged about $3 billion in business email compromise in 2025 [secondary source, say 'reported']. In crypto the same mistake is a copied wrong address; address poisoning was over 10% of wallet drains in 2025.
Truce lets the buyer verify the payee against the merchant's own domain before paying, and the contract pays only the payout wallet the merchant signed. Let me show you the attack failing."

## Demo (3 to 4 minutes, EXAMPLE DATA banner always visible)
1. Fictional **Northlight Design Studio** bills **Beta Labs** 1,250 USDT on net-30 terms (30 days compressed to about 2 minutes; say so on screen).
2. **Hero:** payout wallet swapped in the "email" copy -> verify page FAIL; a direct on-chain `settle` with the swapped payout reverts.
3. Honest invoice -> PASS; buyer signs once, no gas prompt; dashboard shows scheduled/OK.
4. Drain the buyer wallet -> dashboard flips to AT RISK before the due time; top up -> back to OK. (Snapshot, not a lock: say it.)
5. Due time: collection succeeds; explorer link; settled status on the public verify page; CSV row.
6. Limits on screen: testnet, example data, amounts and addresses public, no real users.

## How to say what is new (and what is not)
"Merchant-signed orders, gasless payment and refunds already exist in other entries. We add one thing: the buyer checks the merchant against its own domain, no operator or backend vouching for it, and the contract enforces the signed payout. Same idea as BIP-353 and Lightning Address, applied to signed stablecoin invoices."

## Judge questions and honest answers
| Question | Answer | Weak point to admit |
|---|---|---|
| Isn't this like `PaymentRouter` / GraphPay / others? | They vouch for merchants through an operator registry, a backend role or attesters. We verify against the merchant's own domain. They have more features (disputes, subscriptions) than we do. | Overlap on everything except the domain check |
| Why not direct debit mandates? | Mandates are private, bank-only and rarely cross-border. This is a buyer-signed, publicly checkable commitment for stablecoin-native parties. It does not replace bank rails. | Niche audience |
| Who holds USDT? | Crypto-native companies, DAOs and their agencies; some Ukrainian IT firms. We have no adoption numbers. | No real users |
| What if the wallet is empty at the due date? | Health check warns before; failed state with retries until the grace window ends. | Snapshot, not a lock |
| Why Whitechain? | Track USDT with EIP-3009 and a WBT-funded relayer. The design is portable and the README says so. | Not unique to the chain |
| Can the relayer steal funds? | No: the buyer signature fixes token, amount, destination (the contract) and nonce; the contract pays the payout inside the merchant-signed invoice. | Relayer can delay or censor; buyer can submit themselves |
| What drains the relayer? | Simulate before sending, rate limits, a daily WBT budget. | Budget is small on testnet |
| Lookalike or hacked domain? | Pinning warns when a domain's signing wallet or payout changes after first use. | Does not stop a domain compromised before first use |
| Is the invoice real? | We prove who signed and where it pays, not that goods were sold. | Sockpuppet fraud undetectable |
| Privacy? | Invoice details stay off chain (hash only). Merchant, payer, payout and amount are public. Stealth recipients are roadmap. | Public amounts and addresses |
| ERP integrated? | No. ERP-shaped fields and a CSV export only. | |
| Tax and accounting? | Not solved; CSV only. | |
| The Soul badge? | Mocked, labelled "Individual KYC-verified on WhiteBIT (demo data, mocked)". Personal KYC, not a business check. | Mainnet only, one owner key |

## Claims to avoid
First/only; guaranteed payment; fraud-proof; "needs Whitechain"; verified business; ERP integration; real users; mainnet results we did not run; any figure without its caveat (FBI figure is secondary; B2B stablecoin share is from McKinsey/Artemis via secondary sources).

## Numbers we may quote (with caveats)
BEC about $3.05B reported 2025 (FBI IC3 via secondary); address poisoning over 10% of wallet drains in 2025 and a $50M USDT single loss (Dec 2025); EU Verification of Payee mandatory for euro SEPA payments since 2025-10-09; B2B stablecoin about $226B of about $390B real stablecoin payments in 2025, about 0.02% of global payments (McKinsey/Artemis).
