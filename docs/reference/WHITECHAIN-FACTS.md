# Whitechain verified facts (2026-11-05)

## Networks
| | Sepolia (testnet) | Mainnet |
|---|---|---|
| Chain id | 1874 (0x752) | 1875 (0x753) |
| L1 | Ethereum Sepolia | Ethereum mainnet |
| RPC | https://rpc.testnet.whitechain.io (backup https://rpc.ankr.com/whitechain_testnet; code `Whitechain2026`) | https://rpc.whitechain.io |
| Explorer | https://explorer.testnet.whitechain.io (Blockscout, public API v2, no key) | https://explorer.whitechain.io |
| Faucet | https://faucet.testnet.whitechain.io (GitHub account >= 30 days old; docs 0.5 WBT/24h, flyer 2 WBT/day) | none; buy WBT on WhiteBIT |
| Live since | 2026-08-18 (public testnet) | 2026-10-26 |
Gas token WBT (18 decimals). 1s blocks. EIP-1559 with a 5 gwei base-fee floor + an L1 data fee. RPC limit 50 req/s per IP (burst 500, batch 100). Client: op-reth. Flashblocks not enabled. Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11`.
Withdrawal to Ethereum: testnet about 1 hour, mainnet 7+ days (canonical). Deposits about 2 minutes. Safe: up to about 30 min after batch; finalized about 13 min later.

## Tokens
- **Track USDT (testnet)** `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`: 6 decimals, EIP-1967 proxy (implementation `0x26425662D126412128967ECf0a02EC48573026F7`, `TetherTokenV2`), `permit`, `transferWithAuthorization`, `receiveWithAuthorization`, `cancelAuthorization` (v,r,s and bytes overloads), `authorizationState`, `isBlocked`. EIP-712 domain: name `Tether USD`, version `1`, chainId 1874, verifyingContract = the proxy. `receiveWithAuthorization` requires `msg.sender == to`. Proxy unverified on explorer.
- Testnet USDT.e `0xaa7962d073935D387e8d442DA1D7149C81388f46` (Portal): not the track token. Testnet USDC.e `0x5Eb541ba8A2DD841aF7864c3389162a23ddA8401`.
- **Mainnet USDC.e** `0xF97B9Bf62916f1EB42Dd906a7254603e7b9FC4a7` (proxy to FiatTokenV2_2 `0xaA8145fe0081964F754fa247A5719F3712F3AddF`): has `receiveWithAuthorization`, `transferWithAuthorization`, `permit`, `cancelAuthorization` per its verified ABI. Untested by us. No official USDT on mainnet yet.
- Test tokens carry no value. Test USDT: swap WBT on YetiTrade (a third-party Uniswap-v3-style DEX; swaps of 1,400+ USDT ran today).

## Bridges
Canonical OP Stack bridge for ERC-20 (not native WBT). Portal: a centralized bridge for USDC, USDT, WBT, ETH between Ethereum, Tron and Whitechain (mainnet from 2026-10-27; testnet daily caps USDC 10,000, WBT 200, UAHe 1,000,000, Tron USDT 10,000). Official USD₮ and ETH come to mainnet later after audit.

## Programs and people
Builders Program: up to $300K per eligible team in tranches, application response target 14 business days, not for sanctioned jurisdictions (whitechain.io/builders). Docs publish `llms.txt` and Markdown pages; agent skills at github.com/whitechain-labs/skills.

## Hackathon requirements (from the track text)
Contracts deployed and verified on Whitechain Sepolia; at least one payment in the track USDT in the main flow with an explorer link in the README; a README line on why the flow needs onchain stablecoin settlement; public repo with steady commit history; demo video 2-4 minutes showing each party; `WHITECHAIN_FEEDBACK.md`. Won't place: plain-transfer pay button, tipping, bill splitters, custodial bridges, standalone payroll/escrow/revenue splits. Operate wants: drop-in piece a separate demo app adds in about 20 lines, merchant and customer views, extra credit for refund, renewal, accountant export. See `WHITECHAIN-TRACKS.md`.
