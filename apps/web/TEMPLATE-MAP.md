# Template map

## Source
The look follows a reference the user chose: the "teal treasury landing" component on https://21stdev-my-components-one.vercel.app/#teal-treasury-landing
(a fictional fintech template called "Vaultline"; its footer says it is a made-up company and a template), plus a screen recording of it in `examples/`.
**No code, text, images or brand from it were copied.** Only the visual language was taken: the colour values and font family were read
from its public CSS bundle, and the section layout from the recording. All components, copy and figures are written for Truce.
The template's own name, logo, wordmark and financial claims are not used. No `.env`, lockfile, `node_modules` or media came from it.

| Item | Choice | Note |
|---|---|---|
| Framework | Vite 8 + React 19 + TypeScript 7 (the versions already on `main`) | `docs/design/C-TECHNICAL.md` does not exist; see `docs/DECISIONS-LOG.md` |
| Routing | `react-router-dom` 6 (browser history) | `/pay#doc=...` reads `location.hash` |
| State | React state + one small context (config, wallet, toasts) | no state library |
| Styling | Plain CSS with tokens (`src/styles/`) | no Tailwind: the reference's values are tokens in `tokens.css` |
| Wallet | `viem` only (injected EIP-1193 wallet) | no wagmi / RainbowKit; chain = viem `whitechainSepolia` (id 1874) |
| Signing | `@truce/invoice-lib` through `src/lib/invoiceLib.ts` | nothing re-implemented |
| Tests | `vitest` | unit tests for `lib/*`, the pay gate, and the server-response mapping |
| Lint | `oxlint` | single binary, small lockfile |
| Assets | none (no photographs; product screens are live HTML and SVG) | Inter Tight and JetBrains Mono from Google Fonts (SIL Open Font Licence) |
| Env | `VITE_API_BASE`, `VITE_API_MODE`, `VITE_DEMO_TOOLS`, `VITE_EXAMPLE_MODE`, `VITE_FEATURE_DUE_DATE`, `VITE_FEATURE_SOUL_BADGE` | no secrets; the browser only signs typed data |

## Design tokens taken from the reference
- Page `#f5f4ee`, paper `#ffffff`, ink `#10292d`, muted `#66726f` (darkened to `#5f6b68` for AA), rule `#e2e0d6`.
- Deep teal `#0c2f35` / accent `#0f3238`, deep ink `#eef2ec`, deep muted `#93aaa6`.
- Gold `#8c7b33` / chart gold `#a8963f` (marks and charts; text uses `#6f6127` for AA), lilac `#cdc8f6` on `#1e1a44`, chart lilac `#a9a2ee`.
- Glows `#c9c3f5`, `#f2c4b4`, `#f7dccb`. Font: Inter Tight. Easing `cubic-bezier(.32,.72,0,1)`.
- PASS green and FAIL red stay state colours, always paired with an icon and a word.

## Reference section -> our page or component
| Reference section | Ours | Decision |
|---|---|---|
| Nav with pill CTA | `components/layout/AppShell` | adapt: Truce links, network badge, wallet button |
| Treasury dashboard in a device frame, floating "outgoing wire" card | `pages/landing/Mockups.tsx` `DashboardFrame` | adapt: example merchant invoices, floating PASS payment card, labelled EXAMPLE DATA |
| Big-number stat row | landing `l-stats` | adapt: product facts (10 checks, 1 signature, paid once), not traction figures |
| Sticky media panel with phone + numbered features | landing `l-features`, `PhoneMock` | adapt: truce.json, PASS + Pay, receipt |
| Interactive deposit slider card | landing `AttackCard` | adapt: swap-the-payout toggle flips PASS to FAIL with the two failing checks |
| Dark band with dial graphic | landing `l-band`, `Dial` | adapt: "a swapped payout wallet fails twice" |
| FAQ accordion | `pages/landing/Faq.tsx` | adapt: honest Q&A (commitment, not locked funds; testnet only) |
| Column footer + disclaimer + giant wordmark | `LimitsFooter`, landing `l-wordmark` | adapt: limits line kept on every page |
| Dashboard sidebar + overview | `pages/MerchantPage.tsx` | adapt: figures computed from the merchant's own invoices |
| Pricing, resources, partner banks, LP content | none | remove: not Truce features |

## Third-party marks
- `public/brand/whitechain-mark.svg`: Whitechain's own icon, downloaded unmodified from https://whitechain.io/icon.svg on 2026-11-06.
  Shown in 3D on the landing page ("Built on Whitechain") only to credit the network Truce runs on. The mark belongs to Whitechain;
  no Whitechain endorsement is claimed.
