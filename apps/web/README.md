# Truce web app (`apps/web`)

Landing page, public verify page, buyer pay page, merchant setup and dashboard, and demo tools for Truce: invoices a buyer can verify
against the merchant's own domain before paying in USDT on Whitechain Sepolia (chain 1874). Vite + React + TypeScript.

## Run

Use a separate npm cache if drive C: is full (`npm_config_cache=D:\npm-cache`), then from the repo root (`npm install` at the root installs every workspace, including `apps/server`):

```bash
npm install
cd apps/web
cp .env.example .env.local      # optional; defaults are mock mode with demo tools on
npm run dev                     # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck, then production build into `dist/` |
| `npm run preview` | serve the build (SPA fallback included) |
| `npm run typecheck` / `npm run lint` / `npm test` | `tsc`, `oxlint`, `vitest` |

### Mock mode (default, `VITE_API_MODE=mock`)
No keys, no network. A scenario adapter (`src/lib/api/mock.ts`) implements the same interface as the HTTP client, with a pretend wallet:
merchant pages sign as Northlight Design Studio, buyer pages as Beta Labs (both fictional, labelled EXAMPLE DATA).
The scenario switcher (dark bar under the banner) opens any of the twelve scenarios: pass, swapped payout, tampered amount, wrong signer,
expired, domain unreachable, already paid, paid, at risk, failed, scheduled, pin changed. "Reset mock data" clears what you created.
Hashes and typed data are real in mock mode too (they come from `@truce/invoice-lib`). Only the mock wallet's signature is fake, so mock
verification compares a document with the copy the merchant signed instead of recovering signatures.

### Server mode (`VITE_API_MODE=server`, `VITE_API_BASE=http://localhost:8787`)
Calls `apps/server` over HTTP (routes in `docs/INTERFACES.md` section 6) and an injected browser wallet (MetaMask, Rabby…) through viem.
The wallet button switches to, or adds, Whitechain Sepolia from viem's built-in `whitechainSepolia` definition.
Start the API first: `npm run server` from the repo root (mock chain; add `DEMO_DOMAINS=1` to serve the fictional `*.example` merchants).
`src/lib/api/client.ts` maps the server's real response shapes (`serverTypes.ts`) onto the UI types. `FRONTEND-REQUESTS.md` lists what was mapped
and what is still open: the `/cancel` route and due-date mode are not on the server yet, so they stay behind `VITE_FEATURE_DUE_DATE`.
Checked on 2026-11-06 against `apps/server` in mock chain mode: create (server hash equals our hash), get, list, verify by hash,
verify a tampered copy (FAIL on signature and payout), CSV and `/healthz`. **Not yet checked: paying with a real browser wallet on chain 1874.**

### Flags
| Variable | Default | Effect |
|---|---|---|
| `VITE_DEMO_TOOLS` | on in mock, off in server | `/demo` (tampered links, relayer status) and the scenario switcher |
| `VITE_EXAMPLE_MODE` | off | forces the EXAMPLE DATA banner (it also shows whenever a document has `details.example` or `/api/config` says so) |
| `VITE_FEATURE_DUE_DATE` | off | "Pay on the due date", scheduled / at-risk / failed panels, "Cancel scheduled payment" |
| `VITE_FEATURE_SOUL_BADGE` | off | the mocked badge: "Individual KYC-verified on WhiteBIT (demo data, mocked)" |

## Pages
| Route | Who | What |
|---|---|---|
| `/` | everyone | landing: hero, example dashboard in a device frame, how it works, interactive swapped-payout card, FAQ |
| `/verify` | anyone, no wallet | paste a link or hash; PASS/FAIL, the ten checks in plain words, payment status, history |
| `/pay/<hash>`, `/pay#doc=<base64url>` | buyer | verdict first; invoice; checks; key-pinning notice; Pay only on PASS; progress; receipt with explorer link. A `#doc` copy is checked with `POST /api/verify`, never stored, never payable |
| `/setup` | merchant | connect wallet, domain, payout; download `truce.json` and hosting steps |
| `/merchant` | merchant | dashboard (total, sparkline, Paid / Scheduled / Open, status breakdown, all from your own invoices), list with status, detail drawer with timeline, CSV, create and sign invoices |
| `/demo` | demo only | build swapped-payout, tampered-amount, wrong-signer and expired links; relayer status from `/healthz` |

## Rules this app keeps
- Hashing, signing and typed data come only from `@truce/invoice-lib`, through `src/lib/invoiceLib.ts`. Nothing is re-implemented here.
- Amounts are bigint base units (USDT has 6 decimals); no floating point.
- The browser holds no key and sends no transaction; it signs typed data, and the relayer submits.
- Key pinning lives in `localStorage` (`truce.pins.v1`). A pin is saved after a payment is sent or scheduled.
- Copy follows `docs/PITCH.md`: no "guaranteed", "first", "verified business" or "needs Whitechain". Every page shows the limits line.

## Tests
`npm test` runs unit tests for `format`, `pins`, `messages` (every check id, status, health reason and error code has a plain message),
doc links, config, and the pay gate: Pay is rendered disabled for every FAIL scenario and every tampered `#doc` copy.
The manual acceptance script (verify PASS, swapped payout FAIL with two failing rows, pay and receipt, pin change, create and list, CSV,
banner and footer everywhere) was also run in headless Chrome at 1440 and 390 px in mock mode.

## Layout
```
src/
  app/          AppContext (config, wallet, toast), ErrorBoundary
  components/   layout/, invoice/, verify/, pay/, merchant/, Icon
  lib/          api/ (client, mock, fixtures, types), wallet/, config, format, messages, pins, payGate, doclink, invoiceLib, merchantSetup
  pages/        landing/, VerifyPage, PayPage, SetupPage, MerchantPage, DemoPage
  styles/       tokens, base, ui, app, landing
  test/         vitest unit tests
```
Design: the "teal treasury" look from the reference template the user chose (warm paper, deep teal, olive gold, lilac; Inter Tight and
JetBrains Mono; pill buttons, rounded cards). See `TEMPLATE-MAP.md`.
