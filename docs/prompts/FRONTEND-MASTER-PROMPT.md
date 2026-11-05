# Frontend master prompt (paste into a coding agent opened at the repository root)

Fill the four inputs in section 0, then paste everything inside the block. The prompt is self-contained but tells the agent which repo files to read first.

```
ROLE
You are a senior frontend engineer joining the Truce repository. Build the complete web frontend in apps/web by INTEGRATING our existing UI template, without changing any core functionality, and following the repository structure exactly.

0. INPUTS (the human fills these in before pasting)
TEMPLATE_PATH = <absolute path to the template folder>
FIGMA         = <Figma URL or NONE>
API_BASE      = http://localhost:8787
API_MODE      = mock | server        (mock = built-in scenario adapter; server = real HTTP API)

1. READ FIRST, IN THIS ORDER (do not skip; do not rely on memory)
CLAUDE.md -> docs/SPEC.md (top frozen block) -> docs/INTERFACES.md -> docs/design/A-PRODUCT.md (FR-01 to FR-31) -> docs/design/B-DIAGRAMS.md (sequences B4.1 to B4.6, states B6) -> docs/design/C-TECHNICAL.md (sections 1 to 3 and 8) -> docs/PITCH.md (demo storyline and claims to avoid) -> the exports of packages/invoice-lib.

2. WHAT "WITHOUT CHANGING CORE" MEANS
DO NOT edit: contracts/, packages/invoice-lib/ (import only), apps/server/ (call its HTTP API only), gate/, tools/, the frozen types and routes in docs/INTERFACES.md.
DO NOT re-implement hashing, signing, the ten verification checks, or the typed-data builders. Import them from @truce/invoice-lib (including the ReceiveWithAuthorization and CancelAuthorization builders). If something you need is missing or an API shape is unclear: STOP that feature, write the request in apps/web/FRONTEND-REQUESTS.md (what, why, proposed shape), and continue with the rest using the mock adapter. Never invent API fields.
Allowed: everything under apps/web/, examples/merchant-demo only if told, the apps/web workspace dependencies in package.json, and one line in docs/DECISIONS-LOG.md if you keep a framework different from docs/design/C-TECHNICAL.md.

3. TEMPLATE INTEGRATION PROTOCOL
3.1 Inspect TEMPLATE_PATH read-only (and FIGMA if given). Write apps/web/TEMPLATE-MAP.md: framework and version, styling system, routing, state, wallet libraries, component inventory, assets, env usage, and a table "template component -> our page or component -> keep / adapt / remove".
3.2 Keep the template's framework, design system and look. Do NOT migrate it to another framework. Wallet libraries the template already uses (wagmi, RainbowKit) may stay for connect and signing, but every signed payload comes from @truce/invoice-lib, and the chain is viem's built-in whitechainSepolia (chain id 1874). If the template is Next.js, use client components and nothing that needs a Next server (our API is the separate apps/server).
3.3 Copy only source and minimal assets. NEVER copy .git, node_modules, .next, dist, lockfiles, .env or .env.* files (they can hold secrets), or large media. Check asset licences and note them in TEMPLATE-MAP.md.
3.4 Remove template features unrelated to Truce (swaps, bridges, 3D scenes, demo pages) and the dependencies only they use. The product is invoices, not a DEX.
3.5 Dependencies: prefer none. Add in small batches and commit the lockfile after each batch. Environment note: drive C: is almost full, so run installs with the npm cache on H: (set the environment variable npm_config_cache to a folder on H:, do not change global npm config).
3.6 Respect the commit rule: NO commit may insert or delete more than 1000 lines (a pre-commit hook enforces it; run `npm run check:commits`). One logical change per commit. End each commit message with the attribution line your harness provides.

4. TARGET STRUCTURE (inside apps/web; adapt names to the template's conventions but keep this separation)
apps/web/
  TEMPLATE-MAP.md, FRONTEND-REQUESTS.md, README.md (how to run)
  src/
    routes or app/   setup, merchant, pay/[hash] (also pay#doc=...), verify, demo (flag DEMO_TOOLS)
    components/
      layout/        AppShell, NetworkBadge, ExampleBanner, LimitsFooter, WalletButton
      invoice/       InvoiceCard, LineItems, AmountUsdt, AddressChip, StatusBadge, Timeline
      verify/        VerificationChecklist, VerdictBanner, PinWarning
      pay/           PayPanel, PayProgress, Receipt
      merchant/      SetupWizard, CreateInvoiceForm, InvoiceTable, CsvButton
    lib/
      api/           client.ts (HTTP), mock.ts (scenario adapter), types.ts (re-exports from invoice-lib)
      wallet/        connect, ensureChain, signTypedData helpers
      pins.ts        key pinning in localStorage
      format.ts      USDT (6 decimals), dates (UTC and local), address shortening
      messages.ts    check id -> plain message, error code -> message, status -> badge
      config.ts      env: API_BASE, API_MODE, DEMO_TOOLS, FEATURES { dueDate, soulBadge }
    styles/          template tokens only
    test/            unit tests for lib/*

5. PAGES AND FEATURES (build in this order; the first five are MUST)
5.1 Global shell: EXAMPLE DATA banner whenever a document has details.example=true or config.exampleMode; network badge (Whitechain Sepolia 1874, mock or testnet); wallet button with "switch or add chain" using viem whitechainSepolia; footer line: "Testnet only. Amounts and addresses are public. A signed payment is a commitment, not locked funds."
5.2 /verify (public, no wallet): paste a payment link or hash -> GET or POST /api/verify -> VerdictBanner (PASS green, FAIL red), the ten checks listed with plain-language messages, on-chain status (paid, payer, tx link), audit timeline. This component is reused by /pay.
5.3 /pay/[hash] and /pay#doc=<base64url InvoiceDoc> (buyer): load the document; show invoice (merchant name and domain, client, line items, amount in USDT, due date, expiry); run verify; show the checklist; PinWarning from lib/pins (NEW, MATCH, CHANGED). If FAIL the Pay button is disabled and the failing rows are highlighted. If PASS: connect wallet, ensure chain 1874, build the ReceiveWithAuthorization typed data via invoice-lib (to = settler from /api/config, nonce = invoice hash, validAfter 0 for pay-now), sign once, POST /api/invoices/:hash/authorize {mode:"now", ...}, show PayProgress (Signing, Simulating, Sending, Confirmed), then Receipt with the explorer link. The #doc form is how the demo shows a tampered copy: it must verify through POST /api/verify without storing the document, and it must never enable Pay unless PASS.
5.4 Key pinning (MUST): after a successful payment store {domain: {signingAddress, payoutAddresses}}; on later visits compare and show "This domain's wallets changed since your last payment" with the old and new addresses and a required confirmation checkbox before Pay.
5.5 /setup then /merchant (merchant): SetupWizard (connect wallet, domain, payout address, generate and download truce.json, copy-paste instructions to host it at /.well-known/truce.json, link to /verify); CreateInvoiceForm (client name, line items with live total in USDT, due date, expiry grace days, optional payer lock address, notes, example toggle default ON); sign the Invoice typed data via invoice-lib; POST /api/invoices; show the payment link with copy button; InvoiceTable from GET /api/merchants/:address/invoices (StatusBadge, amount, due date, tx link, row opens a detail panel with the audit Timeline); CsvButton downloading /api/merchants/:address/export.csv.
5.6 SHOULD (behind FEATURES.dueDate, off by default): on /pay a "Pay on due date" option (mode "due", validAfter = dueDate); statuses SCHEDULED_OK, AT_RISK (with reason text), FAILED (with reason and retry note); buyer "Cancel scheduled payment" (signed CancelAuthorization, POST /cancel). Copy must say the health check is a snapshot, not a lock.
5.7 COULD (behind FEATURES.soulBadge, off by default): the mocked badge with EXACTLY this text: "Individual KYC-verified on WhiteBIT (demo data, mocked)". Never write "verified business".
5.8 /demo (only when DEMO_TOOLS is on): buttons that build a tampered link from the current invoice (swapped payout, tampered amount, wrong signer, expired) using the #doc form, plus a small ops panel (GET /healthz: block, relayer balance, last events).

6. DATA CONTRACTS (use exactly; see docs/INTERFACES.md and docs/design/C-TECHNICAL.md section 3)
Endpoints: GET /api/config; POST /api/invoices; GET /api/invoices/:hash; GET /api/verify?hash= and POST /api/verify; POST /api/invoices/:hash/authorize; POST /api/invoices/:hash/cancel; GET /api/merchants/:address/invoices; GET /api/merchants/:address/export.csv; GET /healthz. Errors are {error:{code,message,details?}}.
Verify check ids: document_valid, signature_valid, domain_file_reachable, merchant_matches_domain_file, payout_in_domain_file, domain_hash_matches, chain_and_token_allowed, not_expired, memo_hash_matches_details, payer_ok.
Statuses: ISSUED, SCHEDULED_OK, AT_RISK, PAID, FAILED, CANCELLED, EXPIRED, with overlay PARTIALLY_REFUNDED and REFUNDED. Error codes: INVALID_DOCUMENT, SIGNATURE_INVALID, TOKEN_NOT_ALLOWED, EXPIRED, DUPLICATE, NOT_FOUND, AUTH_INVALID, WRONG_PAYER, SIMULATION_FAILED, INSUFFICIENT_BALANCE, ALREADY_PAID, RELAYER_BUDGET_EXHAUSTED, RATE_LIMITED, NOT_SCHEDULED, NOT_PAID, REFUND_EXCEEDS_PAID, INTERNAL. Write messages.ts with a plain-language message for each check id, status and error code (no jargon: say "The payout wallet is not listed on <domain>", not "payout_in_domain_file failed").
Money: USDT has 6 decimals; amounts arrive as decimal strings; never use floating point for amounts.

7. MOCK ADAPTER (so the UI never waits for the server or chain)
lib/api/mock.ts implements the same interface as client.ts and is selected by API_MODE=mock. Scenarios: pass, swappedPayout (FAIL with signature_valid and payout_in_domain_file failing), tamperedAmount, wrongSigner, expired, domainUnreachable, alreadyPaid, paid with tx link, atRisk (LOW_BALANCE), failed, scheduled, pinChanged. A visible scenario switcher is shown only when DEMO_TOOLS is on. Everything in section 5 must be demonstrable in mock mode with no keys and no network.

8. QUALITY BAR ("perfect" means all of this)
- Accessibility: WCAG AA contrast, full keyboard use, visible focus, labelled inputs, aria-live for status changes and verdicts, never colour alone (icons and text with PASS/FAIL).
- Responsive from 375 px to desktop; no horizontal scroll; tables collapse to cards on mobile.
- States: loading skeletons, empty states, error states with a retry, disabled states with the reason shown.
- Trust UX: addresses shown shortened with a copy button and explorer link; the payout wallet and domain always visible next to the amount; the verdict banner is the most prominent element on /pay.
- Honesty: EXAMPLE DATA banner, limits footer, no claims of "guaranteed", "first", "verified business", or "needs Whitechain".
- Performance: lean bundle, no unused dependencies, no layout shift, no secrets in client code (no private keys, no relayer key; the browser only signs typed data).
- Copy: short, plain English; buttons say what they do ("Pay 1,250 USDT", "Check this invoice").

9. TESTS AND ACCEPTANCE
Automated: typecheck, lint and production build pass; unit tests for format.ts, pins.ts and messages.ts (every check id, status and error code has a message); a test that Pay is disabled for every FAIL scenario in the mock adapter.
Manual script (API_MODE=mock), all must pass: 1) /verify with the pass scenario shows PASS; 2) the swappedPayout link shows FAIL with the two failing rows and Pay disabled; 3) /pay pass scenario signs and shows a Receipt with an explorer link; 4) pinChanged shows the warning and requires confirmation; 5) /merchant creates an invoice and lists it; 6) CSV downloads; 7) EXAMPLE DATA banner and footer appear everywhere.
Server mode (API_MODE=server, once apps/server exists): repeat 1 to 6 against the real API; record any mismatch in FRONTEND-REQUESTS.md instead of changing server or library code.

10. COMMIT PLAN (each at most 1000 inserted or deleted lines; check with npm run check:commits before each)
1) TEMPLATE-MAP.md; 2) minimal template shell copied in, builds; 3) config, api client types, mock adapter; 4) layout and shared components; 5) /verify and checklist; 6) /pay with pinning; 7) /setup and /merchant; 8) tests; 9) feature-flagged due-date and Soul badge; 10) README for apps/web and status update in CLAUDE.md (tick the C2 and C3 boxes only if their criteria are really met).

11. FINAL REPORT (end your work with this, plain text)
What was built per page (done / partial / not done), files added or removed from the template, dependencies added or removed, how to run in mock and server modes, deviations from this prompt and why, open requests in FRONTEND-REQUESTS.md, and anything you could not verify.

12. STOP CONDITIONS
Stop and ask the human if: the template needs a paid licence or contains secrets; a core file (contracts, invoice-lib, server) would have to change; a commit would exceed 1000 lines and cannot be split; you cannot make Pay disabled on FAIL; or you are unsure whether a claim is true.
```

## Notes for the human
- Fill `TEMPLATE_PATH` with the real template folder. `H:\ssd\frontend` is a Next.js app with RainbowKit, a LiFi swap widget and three.js; it is probably an older project, so confirm before pointing the agent at it.
- The prompt keeps the template's framework. `docs/design/C-TECHNICAL.md` chose React and Vite; if the template is Next.js the agent adds one line to `docs/DECISIONS-LOG.md`.
- The agent cannot finish server mode until `apps/server` and `packages/invoice-lib` exist; the mock adapter lets it build and demo everything first.
