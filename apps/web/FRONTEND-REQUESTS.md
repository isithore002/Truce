# Frontend requests

Things the web app needs from the library or the server. No server or library code was changed by the web app;
where the real shape differs from what the UI uses, `src/lib/api/client.ts` (`fromServer`) maps it, field for field.

| Id | Owner | What | Status |
|---|---|---|---|
| R1 | `packages/invoice-lib` | Hashing and typed-data builders | **done**: `src/lib/invoiceLib.ts` delegates to `invoiceHash`, `invoiceTypedData`, `domainHash`, `memoHash`, `receiveAuthorizationTypedData`, `cancelAuthorizationTypedData`, `splitSignature`. Only the 16-byte invoice id is generated in the web app (the library's `randomInvoiceId` is not exported; exporting it would remove that copy) |
| R2 | `apps/server` | `GET /api/config` shape | **done**: server sends `{ chainId, settler, tokens[], explorerBase, exampleMode }`; mapped to `token = tokens[0]`, `explorerUrl = explorerBase` |
| R3 | `apps/server` | health, payment, mode on `GET /api/invoices/:hash` | **done**: `payment {payer, paidAt, txHash}` -> `tx`; `health {reason, checkedAt}` -> `ok = reason === "NONE"`; `schedule` present -> mode `due`. No refund overlay yet (refunds are contract-only, by scope) |
| R4 | `apps/server` | audit trail | **done**: `events[]` with unix `at`; mapped to ISO |
| R5 | shared | `pin` in verify response | **closed**: pinning is browser-side; the server returns `domainFile` and `onchain` instead, typed in `VerifyResponse` |
| R6 | `apps/server` | merchant list item | **done**: `{ items: [...] }`; mapped (no `healthReason` per row, so the dashboard shows the status badge without reason text) |
| R7 | `apps/server` | `/healthz` | **done**: `{ ok, mode, rpc.blockNumber, relayer.wbtBalance }` mapped. There are no "last events" on the server; the ops panel shows "No events yet" |
| R8 | shared | check id `document_valid` | **done**: the library lists all ten ids; the web app re-exports `CHECK_IDS` from it |
| R9 | shared | `docs/design/*` | open: still referenced by the brief; flows follow `SPEC.md`, `ARCHITECTURE.md`, `INTERFACES.md` |
| R10 | `apps/server` | `POST /api/invoices/:hash/cancel` | **open**: route not built. Due-date mode returns `NOT_IMPLEMENTED`. Both sit behind `VITE_FEATURE_DUE_DATE` (off), so the default UI never calls them |
