# Whitechain feedback (draft, updated during the build)

Everything below was observed on 2026-11-05 unless marked "to confirm".

## What worked
- Docs are available as Markdown with an `llms.txt` index, so tools and AI assistants can read them directly.
- The Blockscout API is public and needs no key; the public RPC was reliable; 1-second blocks.
- The docs are candid about the single sequencer, finality stages and the 7+ day canonical withdrawal.
- Reading the track USDT: `name()`, `DOMAIN_SEPARATOR()`, `authorizationState()` and `nonces()` all work, so the signed-transfer surface is usable from a script.

## Where we got stuck / what the docs lacked
1. **EIP-712 domain of the track USDT is not documented.** We had to reconstruct it by matching `DOMAIN_SEPARATOR()`: name "Tether USD", version "1", chainId 1874, verifyingContract = the proxy. A line in the docs would save every team this step.
2. **The track USDT proxy is not verified on the explorer.** Plain transfers decode under an unrelated function name (selector collision), which looks confusing.
3. **Two USDT contracts exist on Sepolia** (track USDT `0xcedf...55a7` and the Portal's "USDT.e" `0xaa79...8f46`). Easy to use the wrong one.
4. **Docs and flyer disagree on the faucet drip** (docs: 0.5 WBT per 24h; flyer: 2 WBT a day). Observed on 2026-11-06: the first claim paid 2 WBT, so the flyer is right and the docs look out of date.
5. **Docs say no third-party public RPC exists for Sepolia**, but `https://rpc.ankr.com/whitechain_testnet` works (and is on the flyer).
6. **WB Soul docs pages return 404** (`/wb-soul/...`) although search engines still list them; the Soul contracts exist on mainnet only, not on Sepolia, so testnet builders cannot try Soul.
7. **Explorer "transactions today" includes one system deposit transaction per block** (about 86,400 a day), which overstates user activity. Non-system transactions are roughly total transactions minus blocks.
8. **Mainnet has no official USDT yet** (docs: a later release after audit), so USDT flows cannot be tried on mainnet.
9. **Fee examples in the docs assume $50 per WBT** while WBT trades near $73, so illustrative costs are understated.
10. **No documented ERC-4337 / paymaster / gas-sponsorship guidance.** Because the token supports EIP-3009, a relayer is the workable path for gasless payments; a short guide would help.
11. **Open question:** who holds the SoulRegistry owner key long-term (currently a single address). No answer yet.
12. **Foundry on native Windows:** the deploy guide says PowerShell and Command Prompt cannot run Foundry and WSL is required. Foundry 1.5.1 installed and `forge init` ran successfully in Git Bash on native Windows here `forge build`, `forge test` (including fuzz and invariant tests) and `forge script` deploys to a local fork all worked in Git Bash on native Windows; a live testnet deploy is still to be recorded below. The guide could mention that Git Bash works.
13. **The track USDT reverts with undocumented strings, not custom errors.** Observed by simulating `receiveWithAuthorization` on chain 1874: `TetherToken: to != msg.sender`, `TetherToken: auth early`, `TetherToken: auth expired`, `TetherToken: auth invalid` (nonce already used or cancelled) and `TetherToken: invalid signature`. They differ from Circle's FiatToken wording, and the unverified proxy means tools cannot decode them. We map them in our relayer; listing them in the docs would save every team the same probing.

## Build-time notes (fill in as we go)
- **Gate 1 live result (2026-11-06): PASS, all checks**, on the track USDT `0xcedf...55a7` (chain 1874), via `npm run gate:live:cancel` with two throwaway wallets.
  - A signed `receiveWithAuthorization` was redeemed on chain by the payee (`msg.sender == to`), 0.01 USDT: https://explorer.testnet.whitechain.io/tx/0x031a1b8954ceb1748b7f94abbaf8e12db56370274e8e43394f00bc483cec59ac
  - Replay of the same authorization, redemption by anyone other than the payee, redemption before `validAfter` and redemption after `validBefore` were all rejected. So due-date collection (`validAfter` = due date) works.
  - A signed `cancelAuthorization`, relayed by a different account, succeeded, and the cancelled authorization could no longer be redeemed: https://explorer.testnet.whitechain.io/tx/0x4eaf18e8c068e42f50875802cc3cb7faa6d955c132a221a6a78dfd9db9a84ec7
- **Contract deploy and verification (2026-11-06): worked first time.** `forge script ... --broadcast` from Git Bash on native Windows deployed `InvoiceSettler` (1,238,694 gas, block 12317840, about 0.012 WBT at the 10 gwei the node quoted): https://explorer.testnet.whitechain.io/address/0xB1e1c081D5FB009D8f908b220D902E9F98dfbFE7
  `forge verify-contract --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` went from "Pending in queue" to "Pass - Verified" in under a minute, with solc 0.8.30 and evm `prague` as the docs say. Small note: Blockscout shows the license as "none" although the source carries an SPDX identifier.
- Relayer / gas experience: _pending_
