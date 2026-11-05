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
4. **Docs and flyer disagree on the faucet drip** (docs: 0.5 WBT per 24h; flyer: 2 WBT a day). To confirm.
5. **Docs say no third-party public RPC exists for Sepolia**, but `https://rpc.ankr.com/whitechain_testnet` works (and is on the flyer).
6. **WB Soul docs pages return 404** (`/wb-soul/...`) although search engines still list them; the Soul contracts exist on mainnet only, not on Sepolia, so testnet builders cannot try Soul.
7. **Explorer "transactions today" includes one system deposit transaction per block** (about 86,400 a day), which overstates user activity. Non-system transactions are roughly total transactions minus blocks.
8. **Mainnet has no official USDT yet** (docs: a later release after audit), so USDT flows cannot be tried on mainnet.
9. **Fee examples in the docs assume $50 per WBT** while WBT trades near $73, so illustrative costs are understated.
10. **No documented ERC-4337 / paymaster / gas-sponsorship guidance.** Because the token supports EIP-3009, a relayer is the workable path for gasless payments; a short guide would help.
11. **Open question:** who holds the SoulRegistry owner key long-term (currently a single address). No answer yet.

## Build-time notes (fill in as we go)
- Gate 1 live result: _pending_
- Contract deploy and verification experience: _pending_
- Relayer / gas experience: _pending_
