# F. Execution handoff

## 1. Prioritized task list (feed one at a time to a coding agent)
Task ids and acceptance criteria are in `D-BUILD-PLAN.md`. Do them in this order; do not start the next until the current task's acceptance criteria pass and it is committed (each commit at most 1000 inserted or deleted lines).

| Order | Task | Who | Notes |
|---|---|---|---|
| 0 | **T01** fund wallets, run live Gate 1 | You (human) | Needs a GitHub account over 30 days old for the faucet |
| 1 | **T02** contract workspace | Agent | Prompt P1 below |
| 2 | **T08** invoice library: types, hashes, signing, golden vectors | Agent | Prompt P2 |
| 3 | **T03** `InvoiceSettler.settle` | Agent | Prompt P3 |
| 4 | **T04 + T06** negative tests and golden-vector test | Agent | Prompt P4 |
| 5 | **T07 + first half of T11** deploy, verify, `e2e-settle` script | Agent + you | Prompt P5; reaches **C1** |
| 6 | **T10** authorization builders | Agent | |
| 7 | **T09** verify pipeline | Agent | |
| 8 | **T11, T11b** chain module (real and mock) | Agent | |
| 9 | **T14, T15, T16** server routes, domain fetch and SSRF guard, authorize now, CSV | Agent | **C2** needs T17 to T19 too |
| 10 | **T17, T18, T19** web shell, buyer page, verify page | Agent | **C2** |
| 11 | **T20, T21, T22** merchant page, SDK, demo app | Agent | **C3** |
| 12 | **T23** key pinning | Agent | **C4** feature freeze |
| 13 | **T26, T27, T28, T29** README, feedback, video, submit | You and agent | **C5** |
| 14+ | Only if ahead of schedule: **T05**, then **T13 + T24**, then **T12 + T25**; Could: **T30**, **T31** | Agent | Decide by the clock gates |

## 2. Implementation prompts for the first five tasks
Paste one at a time into a coding session opened in the repository root. Every prompt assumes the agent has read `CLAUDE.md`.

### P1. T02: contract workspace
```
Context: read CLAUDE.md, docs/design/C-TECHNICAL.md (sections 1, 2, 4) and contracts/foundry.toml.
Goal: make contracts/ ready for InvoiceSettler. No contract logic yet.
Do:
1. Set solc to 0.8.30 and evm_version "prague" in contracts/foundry.toml (the Whitechain docs pin these; verification fails on a compiler mismatch). Keep fs_permissions for ../packages/invoice-lib/test-vectors.
2. Add OpenZeppelin Contracts v5 as a git submodule at contracts/lib/openzeppelin-contracts, pinned to a v5.x release tag (state which tag). Do NOT vendor files. Add remappings (contracts/remappings.txt) so "@openzeppelin/contracts/" resolves.
3. Create contracts/src/interfaces/IERC3009.sol with receiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s), cancelAuthorization(address authorizer,bytes32 nonce,uint8 v,bytes32 r,bytes32 s), authorizationState(address,bytes32) view returns (bool).
4. Create scripts/export-abi.mjs that reads contracts/out/InvoiceSettler.sol/InvoiceSettler.json (if present) and writes contracts/abi/InvoiceSettler.json (ABI only).
5. Add a placeholder contract src/Placeholder.sol that imports EIP712, SignatureChecker, SafeERC20, Pausable, Ownable and ReentrancyGuard from OpenZeppelin so the build proves imports resolve; it will be deleted in task T03.
Constraints: testnet only; no keys; do not touch other folders; each commit at most 1000 inserted or deleted lines (the pre-commit hook enforces it); end commit messages with the attribution line.
Acceptance: `cd contracts && forge build` succeeds with solc 0.8.30; `git submodule status` lists forge-std and openzeppelin-contracts; `node scripts/export-abi.mjs` runs without error (it may report that no artifact exists yet); `npm run check:commits` reports 0 commits over the limit.
Commits: (1) submodule + remappings, (2) foundry.toml + interface + placeholder, (3) ABI export script.
```

### P2. T08: invoice library and golden vectors
```
Context: read CLAUDE.md, docs/INTERFACES.md sections 1, 2, 4 and 9, docs/design/C-TECHNICAL.md section 2.
Goal: packages/invoice-lib is the single TypeScript definition of the invoice, its hashes and signatures. Use viem (hashTypedData, signTypedData, recoverTypedDataAddress, keccak256, stringToHex). No network code.
Create (paths under packages/invoice-lib/): package.json (name @truce/invoice-lib, type module, scripts test and build, devDeps vitest and typescript, dependency viem), tsconfig.json extending ../../tsconfig.base.json, src/types.ts, src/memo.ts, src/hash.ts, src/sign.ts, src/index.ts, test/invoice.test.ts, test-vectors/invoice-vectors.json.
Interfaces to export:
- type Invoice { invoiceId, merchant, payout, token: 0x addresses/bytes32; amount: bigint; dueDate: bigint; expiry: bigint; payer; domainHash; memoHash } exactly as the EIP-712 type in INTERFACES.md section 1.
- type InvoiceDetails { merchantName, clientName, lineItems[{description,quantity,unitPrice}], notes, example: boolean }.
- canonicalJson(value): string (object keys sorted lexicographically at every level, no whitespace, UTF-8) and memoHash(details): Hex = keccak256 of those bytes.
- domainHash(domain: string): Hex = keccak256 of the lowercase UTF-8 domain.
- invoiceTypedData(invoice, { chainId, verifyingContract }) returning the viem typed-data object with domain { name "Truce", version "1", chainId, verifyingContract }.
- invoiceHash(invoice, ctx): Hex (the typed-data digest), signInvoice(account, invoice, ctx): Hex, recoverMerchant(invoice, signature, ctx): Address.
Golden vectors: create test-vectors/invoice-vectors.json with at least 4 vectors (normal, payer-locked, zero-dueDate, unicode memo). Each vector holds: name, chainId 1874, verifyingContract (a fixed placeholder address 0x0000000000000000000000000000000000001234), details, invoice, and expected { memoHash, invoiceHash }, plus signer address and signature produced with the widely published Anvil default account 0 test key. Do not put any other private key in the repo.
Constraints: no network calls; pure functions; each commit at most 1000 lines; add dependencies in one small batch and commit the lockfile separately.
Acceptance: `cd packages/invoice-lib && npm test` passes: round trip sign and recover; changing any single field changes invoiceHash and breaks recovery; memoHash is stable under key reordering; vectors reproduce their expected hashes.
Commits: (1) package skeleton + lockfile, (2) types, memo and hash with tests, (3) signing, (4) golden vectors.
```

### P3. T03: `InvoiceSettler.settle`
```
Context: read CLAUDE.md, docs/design/C-TECHNICAL.md section 4 (the contract design), docs/INTERFACES.md sections 1, 4 and 8, and packages/invoice-lib/test-vectors/invoice-vectors.json. Do not copy any other team's contract.
Goal: write contracts/src/InvoiceSettler.sol (delete src/Placeholder.sol). Solidity 0.8.30.
Spec: inherit OpenZeppelin EIP712("Truce","1"), Ownable, Pausable, ReentrancyGuard; use SignatureChecker and SafeERC20. constructor(address owner, address[] allowedTokens) sets tokenAllowed once. struct Invoice and struct Auth exactly as in INTERFACES.md sections 1 and 8. Implement hashInvoice(Invoice) view returning the typed-data digest (type string: Invoice(bytes32 invoiceId,address merchant,address payout,address token,uint256 amount,uint64 dueDate,uint64 expiry,address payer,bytes32 domainHash,bytes32 memoHash)). Implement settle(Invoice,bytes merchantSig,Auth) with this order: whenNotPaused and nonReentrant; revert InvoiceExpired if block.timestamp > expiry; TokenNotAllowed; InvalidInvoice if amount is 0 or payout is zero; WrongPayer if payer is set and differs from a.from; AlreadyPaid if recorded; BadMerchantSignature unless SignatureChecker.isValidSignatureNow(inv.merchant, digest, merchantSig); record the payment BEFORE external calls; call receiveWithAuthorization(a.from, address(this), amount, a.validAfter, a.validBefore, digest, a.v, a.r, a.s); require the contract balance rose by exactly amount (UnexpectedBalanceChange); safeTransfer to inv.payout; emit InvoicePaid(hash, merchant, payer, payout, amount). Add payments(hash) view, pause and unpause. Do NOT implement refund yet (task T05). Storage packing as in section 4.
Constraints: custom errors only; no admin function can move funds; no external calls before the effects; keep the file under 200 lines; commits at most 1000 lines.
Acceptance: `cd contracts && forge build` passes; a minimal smoke test deploys the contract at the golden-vector verifyingContract address using forge-std deployCodeTo with vm.chainId(1874) and asserts hashInvoice equals the expected invoiceHash for every vector in invoice-vectors.json (read with vm.readFile and vm.parseJson); `forge fmt --check` passes.
Commits: (1) interface and types, (2) settle logic, (3) smoke test.
```

### P4. T04 and T06: tests
```
Context: read CLAUDE.md, docs/design/D-BUILD-PLAN.md (T04, T06, section 6) and contracts/src/InvoiceSettler.sol.
Goal: comprehensive Foundry tests. Create test/mocks/MockEIP3009Token.sol (an ERC-20 implementing receiveWithAuthorization with the real msg.sender == to rule, validAfter and validBefore checks, per-authorizer nonce usage, EIP-712 domain name "Tether USD" version "1", 6 decimals) and a FeeOnTransferToken mock. Create test/InvoiceSettler.t.sol and test/GoldenVectors.t.sol.
Required tests (names must be self-explanatory): test_SettlePaysExactlyTheSignedPayout; test_SwappedPayoutReverts_BadMerchantSignature (the hero test: same buyer authorization, payout changed); test_TamperedAmountReverts; test_WrongMerchantSignerReverts; test_ExpiredReverts; test_SettleTwiceReverts_AlreadyPaid; test_PayerLockRejectsOtherPayer; test_TokenNotAllowedReverts; test_FeeOnTransferTokenReverts; test_EmptyBuyerBalanceReverts; test_AuthorizationBeforeValidAfterReverts; test_PausedReverts; test_MerchantContractWallet_ERC1271Accepted (a mock ERC-1271 wallet); test_ContractTokenBalanceIsZeroAfterSettle. Fuzz: testFuzz_AmountAndTimes. Invariant: settled hashes never settle twice and the contract holds no tokens. GoldenVectors.t.sol asserts every vector's invoiceHash and recovers the vector's signer.
Constraints: tests only; no changes to InvoiceSettler except bug fixes found by tests (list them in the commit message); each commit at most 1000 lines.
Acceptance: `cd contracts && forge test` passes with at least 20 test functions (counting fuzz and invariant); `forge coverage` (if available) shows settle fully covered; the swapped-payout test fails if the merchant-signature check is removed (verify by temporarily commenting it and restoring).
Commits: (1) mocks, (2) core settle tests, (3) edge and fuzz tests, (4) golden vectors test.
```

### P5. T07 and the C1 script: deploy, verify, settle once
```
Context: read CLAUDE.md, docs/reference/WHITECHAIN-FACTS.md, docs/design/C-TECHNICAL.md sections 4 and 6, gate/gate1.mjs (for the token domain and signing pattern) and the Whitechain Foundry deploy guide https://docs.whitechain.io/build/deploy/deploy-with-foundry.md.
Goal: deploy InvoiceSettler to Whitechain Sepolia (chain 1874), verify it on Blockscout, and settle ONE real invoice in the track USDT from a script (checkpoint C1).
Create: contracts/script/Deploy.s.sol (constructor args: owner from env, allowed token = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7); deployments/whitechain-sepolia.json (address, block number, tx hash, compiler, date); scripts/e2e-settle.ts (TypeScript with viem and packages/invoice-lib) that: builds an example invoice (Northlight Design Studio to Beta Labs, 0.01 USDT for repeat runs), has the merchant key sign it, has the buyer key sign ReceiveWithAuthorization (to = InvoiceSettler, nonce = invoice hash, token domain name "Tether USD" version "1"), SIMULATES settle, then sends it with the relayer key, waits for the receipt, prints the explorer links and the on-chain payments(hash); then attempts the SAME flow with a swapped payout and prints that the simulation reverts with BadMerchantSignature and that nothing is sent. Env: DEPLOYER_PK, MERCHANT_PK, PAYER_PK, RELAYER_PK, RPC_URL (default the public RPC). Refuse to run unless chainId is 1874.
Verification command (from the docs): forge verify-contract <address> src/InvoiceSettler.sol:InvoiceSettler --rpc-url https://rpc.testnet.whitechain.io --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ (add --constructor-args from `cast abi-encode`).
Constraints: throwaway keys only, supplied by the human in a git-ignored .env; never print or commit keys; no mainnet; commits at most 1000 lines; add the TS script dependencies in one small batch.
Acceptance: the contract shows as verified on the explorer; the script prints a transaction link showing the USDT transfer from the buyer to the signed payout and an InvoicePaid event; the swapped-payout run is rejected at simulation; update CLAUDE.md status (C1 done), tag the commit `c1`, and record both links in docs/BOOTH-NOTES.md or the README draft.
Commits: (1) deploy script, (2) deployment record, (3) e2e script, (4) status update and tag.
```

## 3. Open questions and decisions I need to make
None of these block starting; the first two decide how you submit.
1. **Submission mode:** Finalist plus partner prizes (needs a 7-minute session with judges) or partner prizes only? Recommendation: choose Finalist only if you can present; otherwise partner-only.
2. **When to push to a public GitHub remote:** push at C1 so judges see steady history. After the first push, do not rewrite history. Which account and repository name (`truce`)?
3. **Licence** for the repository (for example MIT) and the folder rename from `sealedinvoice` to `truce`.
4. **If Gate 1 fails (T01):** permit fallback (a `permit` plus `transferFrom` path in the contract) or the testnet USDC.e if it supports EIP-3009 (UNVERIFIED)? Decide at T01.
5. **Sleep block:** the schedule assumes about 6 hours of sleep after C1. Confirm the timing.
6. **SHOULD features:** the plan only starts due-date mode, health checks, cancel or refund if you are ahead at a checkpoint. Agree that the clock gates decide, not preference.
7. **Soul badge (T31):** default skip. Build it only with more than 2 hours spare after C4.
8. **Hosting (T30):** default skip; a recorded video plus repo is enough.
9. **Demo domain:** use only local fixtures (`*.example`), or also host a real `truce.json` on a domain you control to prove real HTTPS verification?
10. **Buyer wallet** for the recording: MetaMask or Rabby? Test adding chain 1874 early.
11. **OpenZeppelin tag** to pin (a v5.x release); the agent will state its choice in P1.
12. **Booth follow-ups still open:** signed `cancelAuthorization` behaviour (the gate tests it), the faucet drip (0.5 vs 2 WBT per day), and the Soul registry owner key (README open question).
