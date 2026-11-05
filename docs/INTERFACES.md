# Interfaces (the contract between A and B)

**Treat as frozen.** If something here is wrong, fix this file first, then the code, and update the golden vectors in the same commit.
If something here is wrong or missing, fix this file first, then the code.

## 1. Invoice (EIP-712), single source of truth
Domain: `{ name: "Truce", version: "1", chainId, verifyingContract: <InvoiceSettler address> }`
```
Invoice(
  bytes32 invoiceId,    // 16 random bytes, left-padded; high entropy
  address merchant,     // signing wallet (also accepted: ERC-1271 contract wallet)
  address payout,       // where funds go
  address token,        // allowlisted ERC-20 with EIP-3009
  uint256 amount,       // token base units (USDT: 6 decimals)
  uint64  dueDate,      // unix seconds
  uint64  expiry,       // last moment the invoice can be settled (due date + grace)
  address payer,        // 0x0 = anyone may pay
  bytes32 domainHash,   // keccak256(utf8(lowercase merchant domain))
  bytes32 memoHash      // keccak256(canonical JSON of the off-chain details, see section 2)
)
```
`invoiceHash` = the EIP-712 typed-data digest. It is also the EIP-3009 `nonce`.
Canonical JSON for `memoHash`: UTF-8, object keys sorted lexicographically, no insignificant whitespace, all numbers as strings.

## 2. Invoice document (what is stored and what the payment link carries)
```json
{ "version": 1,
  "invoice": { "invoiceId": "0x..", "merchant": "0x..", "payout": "0x..", "token": "0x..", "amount": "1250000000",
               "dueDate": "1767225600", "expiry": "1767484800", "payer": "0x000..0", "domainHash": "0x..", "memoHash": "0x.." },
  "signature": "0x..",
  "domain": "northlight-design.example",
  "details": { "merchantName": "Northlight Design Studio", "clientName": "Beta Labs",
               "lineItems": [{ "description": "Brand identity", "quantity": "1", "unitPrice": "1250000000" }],
               "notes": "Net 30", "example": true } }
```
`details` is hashed into `memoHash`; changing it breaks the signature. `example: true` makes the UI show an "EXAMPLE DATA" banner.

## 3. Merchant domain file `/.well-known/truce.json`
```json
{ "version": 1, "name": "Northlight Design Studio", "signingAddress": "0x..", "payoutAddresses": ["0x.."], "chainIds": [1874] }
```
Verification checks (each returns `{ id, ok, message }`, any failure = FAIL): `domain_file_reachable`, `signature_valid` (recovers to `invoice.merchant`),
`merchant_matches_domain_file`, `payout_in_domain_file`, `domain_hash_matches`, `chain_and_token_allowed`, `not_expired`, `memo_hash_matches_details`, `payer_ok`.
Pinning (browser): after a first payment, store `domain -> { signingAddress, payoutAddresses }`; a later change shows a warning and needs explicit confirmation.

## 4. Buyer authorization (EIP-3009 `ReceiveWithAuthorization`)
`from = buyer`, `to = InvoiceSettler`, `value = invoice.amount`, `nonce = invoiceHash`, `validAfter`, `validBefore`.
Pay now: `validAfter = 0`. Due-date mode: `validAfter = invoice.dueDate`. `validBefore <= invoice.expiry`.
```json
{ "mode": "now" | "due", "from": "0x..", "validAfter": "0", "validBefore": "1767484800", "v": 27, "r": "0x..", "s": "0x.." }
```
Token EIP-712 domain (track USDT, verified): name `Tether USD`, version `1`, chainId 1874, verifyingContract = the USDT proxy.

## 5. Statuses
`ISSUED -> SCHEDULED_OK | AT_RISK | PAID | FAILED | CANCELLED | EXPIRED`, plus `REFUNDED` (full) / `PARTIALLY_REFUNDED` as an overlay on `PAID`.
Health `reason`: `NONE | LOW_BALANCE | AUTH_CANCELLED | AUTH_EXPIRING | BLOCKED`.
`FAILED` keeps retrying until `validBefore`. The health check is a snapshot, not a lock. UI copy must say so.

## 6. Backend REST API (module `api`; calls the chain module through `ChainModule`)
| Method and path | Body / query | Returns |
|---|---|---|
| `POST /api/invoices` | invoice document | `201 { hash, link }` |
| `GET /api/invoices/:hash` | | `{ doc, status, health, tx? }` |
| `GET /api/verify?hash=` or `POST /api/verify` (doc) | | `{ result: "PASS"\|"FAIL", checks: Check[], pin: {...} }` |
| `POST /api/invoices/:hash/authorize` | buyer authorization | `202 { status }` |
| `POST /api/invoices/:hash/cancel` | `{ v, r, s }` for `CancelAuthorization` | `202 { txHash }` |
| `POST /api/invoices/:hash/refund` | merchant refund authorization, `amount` | `202 { txHash }` |
| `GET /api/merchants/:address/invoices` | | `Invoice summary[]` |
| `GET /api/merchants/:address/export.csv` | | CSV (invoice id, names, amount, due, status, tx link, paid at) |
**Roadmap, not in the solo build.** Webhooks (merchant URL, JSON): `invoice.scheduled | invoice.at_risk | invoice.failed | invoice.paid | invoice.refunded` with `{ event, hash, status, reason?, txHash? }`.
Errors: `{ error: { code, message } }`; contract custom errors are mapped to friendly messages.

## 7. Chain module (module `chain`), called by the API and the scheduler
```ts
export interface ChainModule {
  settle(doc: InvoiceDoc, auth: BuyerAuth): Promise<{ txHash: `0x${string}` }>;
  health(doc: InvoiceDoc, auth: BuyerAuth): Promise<{ ok: boolean; reason: HealthReason; balance: bigint }>;
  cancelAuthorization(from: Address, nonce: Hex, sig: { v: number; r: Hex; s: Hex }): Promise<{ txHash: Hex }>;
  refund(hash: Hex, amount: bigint, merchantAuth: RefundAuth): Promise<{ txHash: Hex }>;
  onchainStatus(hash: Hex): Promise<{ paid: boolean; refunded: bigint; payer?: Address; txHash?: Hex }>;
  startScheduler(): void; // settles due-date authorizations, runs health checks, updates Store
}
```
Implementations: `chain/mock.ts` (scripted, lets the UI be built without the chain) and `chain/viem.ts` (real). Selected by `CHAIN_MODE`.
Store (module `api`, interface in `apps/server/src/shared/store.ts`, used by the scheduler): `get(hash)`, `put(doc)`, `setAuth(hash, auth)`, `setStatus(hash, status, health?, tx?)`, `dueSoon(now)`.

## 8. Contract surface. ABI is committed at `contracts/abi/InvoiceSettler.json` and regenerated on every contract change
```
settle(Invoice inv, bytes merchantSig, Auth a)       // Auth { from, validAfter, validBefore, v, r, s }
refund(bytes32 hash, uint256 amount, Auth merchantAuth)
hashInvoice(Invoice inv) view returns (bytes32)       // used to cross-check TS vs Solidity
payments(bytes32 hash) view returns (payer, payout, amount, refunded, paidAt)
event InvoicePaid(bytes32 indexed hash, address indexed merchant, address indexed payer, address payout, uint256 amount)
event Refunded(bytes32 indexed hash, address indexed payer, uint256 amount, uint256 totalRefunded)
errors: InvoiceExpired, AlreadyPaid, BadMerchantSignature, WrongPayer, TokenNotAllowed, RefundExceedsPaid, NotPaid
```

## 9. Golden vectors (prevents silent drift between TypeScript and Solidity)
`packages/invoice-lib/test-vectors/invoice-vectors.json`: sample invoices with the expected `invoiceHash`, `memoHash`, and a signature from a published test key.
Both the TypeScript tests and a Foundry test read this file and must produce the same hashes. Whoever changes the type updates the vectors in the same PR.
