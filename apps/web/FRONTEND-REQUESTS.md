# Frontend requests

Things the web app needs from other owners. Until each one is answered, the web app runs on the mock adapter (`VITE_API_MODE=mock`)
using the **proposed** shape, marked `PROPOSED (Rn)` in `src/lib/api/types.ts`. No server or library code was changed.

| Id | Owner | What | Why | Proposed shape | Status |
|---|---|---|---|---|---|
| R1 | A (`packages/invoice-lib`) | Exports: `newInvoiceId()`, `domainHash(domain)`, `memoHash(details)`, `invoiceHash(invoice, {chainId, settler})`, `invoiceTypedData(invoice, ctx)`, `receiveWithAuthorizationTypedData({token, chainId, from, to, value, validAfter, validBefore, nonce})`, `cancelAuthorizationTypedData({token, chainId, authorizer, nonce})`, and the types in INTERFACES sections 1 to 5 | The package is empty. The web app must not re-implement hashing or typed data, so in server mode every signing button is disabled with the reason shown | viem `TypedDataDefinition` return values, so the browser passes them straight to `signTypedData` | open |
| R2 | B (`apps/server` api) | Shape of `GET /api/config` | Pay needs the settler address (`to` in ReceiveWithAuthorization) and token; the shell needs example mode | `{ chainId, settler, token, tokenSymbol, tokenDecimals, explorerUrl, exampleMode }` | open |
| R3 | B | Shapes of `health` and `tx` in `GET /api/invoices/:hash`, plus the refund overlay and the chosen mode | Verify shows payer and tx link; merchant table shows the reason text | `health: { ok, reason, checkedAt? }`, `tx?: { txHash, payer?, paidAt? }`, `overlay?: "PARTIALLY_REFUNDED" \| "REFUNDED"`, `mode?: "now" \| "due"` | open |
| R4 | B | Audit trail for an invoice | The verify page and merchant detail panel show a timeline; no endpoint returns events | `events?: { at (ISO), type, detail?, txHash? }[]` on `GET /api/invoices/:hash` | open |
| R5 | B | Shape of `pin` in the verify response | INTERFACES writes `pin: {...}`. Pinning is browser-side, so the UI does not read it | Either drop it, or `{ domain, signingAddress, payoutAddresses }` from the domain file | open |
| R6 | B | Item shape of `GET /api/merchants/:address/invoices` | INTERFACES says `Invoice summary[]` | `{ hash, invoiceId, clientName, amount, dueDate, status, overlay?, healthReason?, txHash?, paidAt?, example? }` | open |
| R7 | B / A | Shape of `GET /healthz` | /demo ops panel shows block, relayer balance and last events | `{ ok, chainMode?, block?, relayerBalanceWei?, lastEvents?: { at, event, hash? }[] }` | open |
| R8 | shared (`docs/INTERFACES.md`) | Check id `document_valid` | The frontend brief lists ten check ids including `document_valid`; INTERFACES section 3 lists nine. The UI handles both | Add `document_valid` to INTERFACES section 3 | open |
| R9 | shared | `docs/design/A-PRODUCT.md`, `B-DIAGRAMS.md`, `C-TECHNICAL.md` | The brief asks to read them; they are not in the repo. Framework and flows follow `docs/SPEC.md`, `ARCHITECTURE.md` and `INTERFACES.md` instead | n/a | open |
