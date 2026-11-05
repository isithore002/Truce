# C. Technical design

## 1. Tech stack, with the reason and one rejected alternative
| Layer | Choice | Why | Rejected alternative |
|---|---|---|---|
| Contract language and tests | Solidity **0.8.30**, evm `prague`, Foundry (forge, cast) | Whitechain docs pin exactly these for verification; Foundry has fuzz, invariant and fork tests and runs natively in Git Bash here | Hardhat: slower tests, JS-based fuzzing is weaker |
| Contract libraries | OpenZeppelin v5 (`EIP712`, `SignatureChecker`, `SafeERC20`, `Pausable`, `Ownable`, `ReentrancyGuard`) as a git submodule pinned to a release tag | Audited primitives; ERC-1271 merchant signatures for free. Exact tag chosen at install (UNVERIFIED which) | Hand-rolled signature checks |
| Shared library | TypeScript + **viem** (`hashTypedData`, `signTypedData`, `verifyTypedData`, built-in `whitechainSepolia`) | Whitechain docs recommend viem (OP Stack aware); one library shared by web, server and SDK | ethers v6: no OP Stack fee helpers |
| Server | Node 22, **Fastify**, zod validation, pino logs | Fast to write, schema validation, shares TypeScript types with the library | Spring Boot: a second language would duplicate the invoice library and slow iteration; Express: weaker typing and validation |
| Store | JSON file with atomic writes behind a `Store` interface | Zero setup; data volume is tiny; swappable later | SQLite or Postgres (Neon): setup time not justified for a demo |
| Web | React + Vite + TypeScript; wallet through viem and an injected EIP-1193 provider | No SSR needed; the server owns fetching and secrets; fewer moving parts | Next.js: SSR unneeded; wagmi: extra abstraction layer |
| TS tests | vitest | Fast, TypeScript native | jest |
| Chain access | Public RPC `rpc.testnet.whitechain.io` (50 req/s per IP), backup Ankr | Documented, no key | Running our own node |
| CI | None; local `npm run check` (tests + commit-size check) | Time | GitHub Actions (setup cost, no remote yet) |
| Hosting | Local for the recorded demo; optional static and Node hosting (UNVERIFIED free tiers) | Judges need repo, video and explorer links | Mandatory public deployment |

## 2. Repository structure
```
truce/                               (folder currently named sealedinvoice)
  contracts/                         Foundry project
    src/InvoiceSettler.sol           the contract
    src/interfaces/IERC3009.sol      receiveWithAuthorization surface
    test/                            unit, fuzz, invariant, fork, golden-vector tests
    script/Deploy.s.sol              deploy script
    abi/InvoiceSettler.json          exported ABI, committed
    lib/forge-std, lib/openzeppelin-contracts   submodules
  packages/invoice-lib/              shared TypeScript library
    src/{types,hash,sign,verify,domainFile,authorization}.ts
    test-vectors/invoice-vectors.json    golden vectors read by TS and Foundry tests
  apps/server/src/
    api/{routes,schemas,errors,csv}.ts
    chain/{index,viem,mock,simulate,scheduler,health,budget}.ts
    shared/{store,types,config,log}.ts
    domain/{fetchDomainFile,ssrfGuard,cache}.ts
  apps/web/src/                      pages: merchant, pay/:hash, verify, setup
  sdk/src/index.ts                   createInvoice and types
  examples/merchant-demo/            about 20 lines using the SDK
  fixtures/                          example merchants and domain files (EXAMPLE DATA)
  deployments/whitechain-sepolia.json    deployed addresses and block numbers
  scripts/                           e2e-settle script, ABI export
  gate/  tools/  docs/               gate test, radar and commit-size checker, documents
```

## 3. API specification
Conventions: JSON; addresses checksummed; hashes lowercase `0x`; big numbers as decimal strings; timestamps in unix seconds; errors as `{ "error": { "code", "message", "details"? } }`. Shared object `InvoiceDoc` is defined in `../INTERFACES.md` section 2.

| Method and path | Request | Success response | Main errors |
|---|---|---|---|
| `GET /api/config` | | `{ chainId, settler, tokens[], explorerBase, exampleMode }` | |
| `POST /api/invoices` | `InvoiceDoc` | `201 { hash, link }` | `INVALID_DOCUMENT` 400, `SIGNATURE_INVALID` 422, `TOKEN_NOT_ALLOWED` 422, `EXPIRED` 422, `DUPLICATE` 409 |
| `GET /api/invoices/:hash` | | `{ doc, status, health?, payment?, schedule?, events[] }` | `NOT_FOUND` 404 |
| `GET /api/verify?hash=` or `POST /api/verify` (body `InvoiceDoc`) | | `{ result: "PASS" or "FAIL", checks: [{ id, ok, message }], domainFile?, onchain: { paid, payer?, refunded?, txHash? } }` | `DOMAIN_UNREACHABLE` is reported as a failed check, not an HTTP error |
| `POST /api/invoices/:hash/authorize` | `{ mode: "now" or "due", from, validAfter, validBefore, v, r, s }` | mode now: `200 { status: "PAID", txHash }` (waits up to 15 s, else `202 { status: "PENDING" }`); mode due: `202 { status: "SCHEDULED_OK" }` | `AUTH_INVALID` 422, `WRONG_PAYER` 403, `SIMULATION_FAILED` 422, `INSUFFICIENT_BALANCE` 422, `ALREADY_PAID` 409, `EXPIRED` 410, `RELAYER_BUDGET_EXHAUSTED` 503, `RATE_LIMITED` 429 |
| `POST /api/invoices/:hash/cancel` | `{ v, r, s }` (signed `CancelAuthorization`) | `202 { txHash }` | `NOT_SCHEDULED` 409, `AUTH_INVALID` 422 |
| `POST /api/invoices/:hash/refund` | `{ amount, merchantAuth: { validAfter, validBefore, v, r, s } }` | `202 { txHash }` | `NOT_PAID` 409, `REFUND_EXCEEDS_PAID` 422 |
| `GET /api/merchants/:address/invoices` | | `{ items: [InvoiceSummary] }` | |
| `GET /api/merchants/:address/export.csv` | | `text/csv` | |
| `GET /healthz` | | `{ ok, rpc: { chainId, blockNumber, lagSeconds }, relayer: { address, wbtBalance }, store: { invoices } }` | |

**Verify check ids** (all must pass for PASS): `document_valid`, `signature_valid`, `domain_file_reachable`, `merchant_matches_domain_file`, `payout_in_domain_file`, `domain_hash_matches`, `chain_and_token_allowed`, `not_expired`, `memo_hash_matches_details`, `payer_ok`.
**Error codes:** `INVALID_DOCUMENT`, `SIGNATURE_INVALID`, `TOKEN_NOT_ALLOWED`, `EXPIRED`, `DUPLICATE`, `NOT_FOUND`, `AUTH_INVALID`, `WRONG_PAYER`, `SIMULATION_FAILED`, `INSUFFICIENT_BALANCE`, `ALREADY_PAID`, `RELAYER_BUDGET_EXHAUSTED`, `RATE_LIMITED`, `NOT_SCHEDULED`, `NOT_PAID`, `REFUND_EXCEEDS_PAID`, `INTERNAL`. Contract custom errors map to these (`BadMerchantSignature` to `SIGNATURE_INVALID`, `AlreadyPaid` to `ALREADY_PAID`, and so on).

## 4. Smart contract design: `InvoiceSettler`
**Inheritance:** `EIP712("Truce","1")`, `Ownable`, `Pausable`, `ReentrancyGuard`; uses `SignatureChecker` and `SafeERC20`.
**Constructor:** `(address owner, address[] allowedTokens)`. The allowlist is set once and never changed (no admin power over which tokens are accepted).
**EIP-712 type:** `Invoice(bytes32 invoiceId,address merchant,address payout,address token,uint256 amount,uint64 dueDate,uint64 expiry,address payer,bytes32 domainHash,bytes32 memoHash)`. `hashInvoice(inv)` returns the full typed-data digest; it is also the EIP-3009 nonce. A redeploy changes the digests, so invoices must be reissued after a redeploy.

**Storage layout (own slots):**
| Slot | Contents |
|---|---|
| `_payments[hash]` slot A | `payer` (20 bytes) + `paidAt` (uint64) |
| slot B | `payout` (20 bytes) |
| slot C | `amount` (uint128) + `refunded` (uint128) |
| `tokenAllowed[token]` | bool |
OpenZeppelin bases add `_owner`, `_paused`, reentrancy status; `EIP712` uses immutables.

**Functions**
- `settle(Invoice inv, bytes merchantSig, Auth a)`: external, `nonReentrant`, `whenNotPaused`. Order: expiry -> token allowed -> payer lock -> unpaid -> `SignatureChecker.isValidSignatureNow(inv.merchant, digest, merchantSig)` (EOA or ERC-1271) -> **record payment first** -> `receiveWithAuthorization(a.from, address(this), inv.amount, a.validAfter, a.validBefore, digest, a.v, a.r, a.s)` -> require the contract's balance rose by exactly `amount` (rejects fee-on-transfer tokens) -> `safeTransfer(inv.payout, amount)` -> emit. Also reject `amount == 0` and `payout == address(0)`.
- `refund(bytes32 hash, uint256 amount, Auth m)`: external, `nonReentrant`. Requires a recorded payment, `m.from == payout`, `amount > 0`, `refunded + amount <= paid`. The EIP-3009 nonce is `keccak256(abi.encode("REFUND", hash, refundedBefore))`. Pulls from the payout with `receiveWithAuthorization`, sends to the **original payer only**. Works while paused.
- Views: `hashInvoice`, `payments(hash)`, `tokenAllowed(token)`, `refundNonce(hash)`.
- Owner functions: `pause()`, `unpause()` only.

**Events:** `InvoicePaid(bytes32 indexed hash, address indexed merchant, address indexed payer, address payout, uint256 amount)`, `Refunded(bytes32 indexed hash, address indexed payer, uint256 amount, uint256 totalRefunded)`.
**Errors:** `InvoiceExpired`, `AlreadyPaid`, `BadMerchantSignature`, `WrongPayer`, `TokenNotAllowed`, `InvalidInvoice`, `NotPaid`, `NotPayout`, `RefundExceedsPaid`, `UnexpectedBalanceChange`.
**Access control:** owner can only pause new settlements. No function lets anyone move funds other than by a valid merchant signature plus buyer authorization (settle) or payout signature (refund).
**Upgrade strategy:** none. Immutable and redeployable; testnet deployments recorded in `deployments/whitechain-sepolia.json`.
**Invariants (tested):** each hash settles at most once; `refunded <= amount` always; the contract's token balance is zero after every external call; the amount that leaves to the payout equals the signed amount and goes only to the signed payout.
**Gas:** about 120k to 200k per settle (estimate, UNVERIFIED). At the 5 gwei floor that is about 0.0006 to 0.001 WBT before the L1 data fee.
**Known limits:** the buyer's authorization is an EIP-3009 signature checked by the token; buyer contract wallets are UNVERIFIED. Token behaviour beyond the allowlisted USDT is out of scope.

## 5. Data storage, indexing and caching
- **Store:** one JSON file (`data/store.json`) with collections `invoices`, `authorizations`, `payments`, `refunds`, `healthChecks`, `events`, `domainCache`. Writes go to a temp file and rename (atomic); the file is backed up on every Nth write. All access is through the `Store` interface (`get`, `put`, `setAuth`, `setStatus`, `dueSoon`, `list`).
- **Chain reconciliation:** besides trusting our own transactions, a poller reads `InvoicePaid` and `Refunded` logs from the deployment block every 15 seconds and calls `payments(hash)` so settlements made outside our server (a buyer submitting their own call) update the status.
- **Caching:** verified domain files cached 5 minutes (keyed by domain); verify results are not cached across invoices. Browser key pins live in `localStorage`.
- **Off-chain details** (names, line items) stay in the store; their hash is committed in the signed invoice.

## 6. Integration map
| Service | Purpose | Auth | Limits | Fallback |
|---|---|---|---|---|
| Whitechain public RPC `rpc.testnet.whitechain.io` | reads, simulate, send | none | 50 req/s per IP, burst 500, batch 100 (docs) | Ankr `rpc.ankr.com/whitechain_testnet`; batch reads with Multicall3 |
| Blockscout API and UI | contract verification, explorer links | none for reads | per IP, unspecified | omit links, keep tx hashes |
| Merchant domain file | trust anchor | none | our own fetch limits (timeout 3 s, 64 KB) | demo fixtures for `*.example` |
| Wallet (MetaMask, Rabby) | typed-data signatures | user approval | n/a | script signing with a throwaway key for the demo |
| Faucet (GitHub login) | test WBT | GitHub account over 30 days old | drip 0.5 or 2 WBT per day, UNVERIFIED | ask booth; second GitHub account |
| YetiTrade DEX | test USDT | wallet | pool depth | ask other teams or the booth |
| OpenZeppelin, forge-std | contract libraries | n/a | n/a | pin versions in submodules |

## 7. Security and threat model: top 10
| # | Threat | Mitigation | Residual |
|---|---|---|---|
| T1 | Swapped or forged payout in an emailed invoice | Merchant EIP-712 signature covers `payout`; buyer app checks it against the domain file; the contract pays only the signed payout | If the buyer ignores the app and the merchant key itself is compromised |
| T2 | Lookalike domain | Show the domain prominently; pin domain to keys after a first payment and warn on change | Does not stop a buyer trusting a lookalike on first use |
| T3 | Merchant domain compromised before first use | Pinning warns on later changes; keys come from the merchant's wallet, not the server | Domain takeover before first pin is not detected |
| T4 | Relayer abuse or gas drain | Simulate before sending; per-IP rate limit; daily WBT budget; failed simulations cost nothing | Budget exhaustion denies service; buyer can self-submit |
| T5 | Replay, double settle, reentrancy | Nonce equals the invoice digest; `paid` check before external calls; `nonReentrant`; token allowlist | Token upgrade risk on the track USDT proxy (out of our control) |
| T6 | Malicious or fee-on-transfer token | Allowlist fixed at deploy; balance-delta check | Allowlisted token is trusted |
| T7 | Tampered off-chain details | `memoHash` is signed; verify recomputes it | Server can withhold details (availability only) |
| T8 | Blind signing or phishing UI | Typed data shows contract, amount and nonce; the app shows the full checklist; the open-source app is the trust point | A malicious copy of the app can lie about details |
| T9 | Key exposure (relayer key, `.env`) | Throwaway keys only; `.env` ignored; never in the repo or chat; chain id guard in scripts | A leaked testnet key only costs test funds |
| T10 | SSRF through domain-file fetch | `https` only (http only with a dev flag); resolve the host and block private, loopback and link-local ranges; no redirects to blocked hosts; 3 s timeout; 64 KB cap; no cookies | DNS rebinding mitigated by re-checking the resolved IP at connect time |
Extra: an empty buyer wallet at the due time (health check is a snapshot, not a lock); front-running the buyer authorization is harmless because only the contract can redeem it (`msg.sender == to`).

## 8. Observability
- **Logs:** pino JSON with `requestId`, `invoiceHash`, `module` (`api` or `chain`); secrets redacted.
- **Audit timeline:** every invoice has an `events` list (created, verified, authorized, simulated, submitted with tx hash, paid, at risk, failed, cancelled, refunded) shown on the dashboard and verify page.
- **Metrics:** `/healthz` plus counters in memory (verifications by result, settles ok or failed, simulation failures, relayer WBT balance, RPC lag).
- **Demo ops panel (small side panel):** current block, relayer balance, last 5 audit events, explorer link for each transaction.
- **Show in the demo:** the check list with a failing row, the simulation revert reason, the transaction on the explorer, the audit timeline.
