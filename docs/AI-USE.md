# How AI was used in this project

We used **Claude Code (Anthropic)** as an assistant during the hackathon. The decisions about scope, direction and what to submit are the team's.

## Where AI helped
- **Research and planning:** prior-art and market research, comparing Whitechain with other chains, and drafting the planning documents in this repo (`docs/SPEC.md`, `docs/MARKET-RESEARCH.md`, `docs/archive/`). Sources and uncertainty are noted in those documents.
- **Scripts:** `gate/gate1.mjs` (a Gate 1 test of the signed-transfer feature on the track USDT) and `tools/competitor-radar.js` (a read-only scan of recently verified contracts).
- **Code:** Claude Code wrote most of the code in this repository under the developer's direction: the `InvoiceSettler` contract and its Foundry tests (including refunds), the TypeScript invoice library, the relayer and chain module, the API server and due-date scheduler, the React web app, the SDK and example app, and the live end-to-end scripts. The developer set the scope, approved every funding, deployment and live-transaction step, supplied and funded the throwaway testnet wallets (keys were never shown to the assistant), and decided what to submit.
- **Autonomous run (2026-11-06):** the developer authorised the assistant to build the remaining scope (merchant page, SDK, key pinning, refunds and redeploy, due-date mode, health and cancel, the mocked Soul badge, documentation) from the written plan in `docs/prompts/AUTONOMOUS-RUN.md`, logging each step in `docs/AUTONOMOUS-LOG.md`, and to finish with an audit (`docs/AUDIT.md`).
- **Verification:** automated tests (Foundry, vitest) and live testnet scripts with explorer links. The assistant had no browser, so the interactive wallet click-through is a human check (see `docs/SUBMISSION-CHECKLIST.md`).

## Planning artifacts
All specs, research notes and prompts that shaped the project are kept in `docs/` so the work can be audited. A superseded earlier design is kept in `docs/archive/` for history.

## What we did not do
- We did not copy other teams' contracts. We read some public contracts on the testnet only to assess overlap and wrote ours from scratch.
- Example merchants, clients and invoices in the demo are fictional and labelled as examples.

- **Web app (`apps/web`):** Claude Code built the frontend (pages, components, mock adapter, unit tests), wired it to `@truce/invoice-lib` and the real `apps/server` responses, restyled it to a reference look the user chose, and checked it in headless Chrome and against the server in mock chain mode. Open items are in `apps/web/FRONTEND-REQUESTS.md`.

- **Additions after the autonomous run (2026-11-06, at the developer's request):** Claude Code built the storefront demo app, the live-refreshing dashboard, the network-fee line on the receipt, the refund route and panel, the monthly series of separate invoices, the CSV refund columns and the ledger export, the merchant-side PASS/FAIL preview, the corrected wording for unread domain files, the read-only RPC fallback, the Setup page's "Check my domain" button (found necessary in the developer's own click-through), and the ERP-style architecture note. Each has tests, and the refund, ledger and RPC fallback were also run against the live testnet (see `docs/AUDIT.md` section 10). The assistant still had no browser, so none of the new screens was seen working with a wallet.
- **Web contributions by another developer and their AI assistant** (landing page, styling, wallet connect modal and account-change handling) are in the git history under that developer's name.

## Team review
_Developer to complete before submitting: what you reviewed by hand and the browser click-through you did._
