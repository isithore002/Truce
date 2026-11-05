# Template map

## Source
No UI template folder was supplied (`TEMPLATE_PATH` was left empty, `FIGMA = NONE`). The web app is built from scratch on the
design rules of **tasteskill 2.5** (a design-system skill used inside Claude Code). Nothing was copied from a third-party template,
so there are no template files, licences, `.env` files or media to audit. The dealt choices are recorded in `.taste-skill/`.

| Item | Choice | Note |
|---|---|---|
| Framework | Vite 6 + React 18 + TypeScript | `docs/design/C-TECHNICAL.md` does not exist yet; see `docs/DECISIONS-LOG.md` |
| Routing | `react-router-dom` (browser history) | `/pay#doc=...` reads `location.hash` |
| State | React state + one small context (config, wallet, toasts) | no state library |
| Styling | Plain CSS with tokens (`src/styles/`) | palette "three stones", Host Grotesk + JetBrains Mono, radius sharp |
| Wallet | `viem` only (injected EIP-1193 wallet) | no wagmi / RainbowKit: smaller bundle; chain = viem `whitechainTestnet` (id 1874) |
| Tests | `vitest` | unit tests for `lib/*`, Pay-disabled test via `react-dom/server` |
| Lint | `oxlint` | single binary, small lockfile |
| Assets | none (no photographs; UI is shown as live HTML) | fonts from Google Fonts (SIL Open Font Licence) |
| Env | `VITE_API_BASE`, `VITE_API_MODE`, `VITE_DEMO_TOOLS`, `VITE_EXAMPLE_MODE`, `VITE_FEATURE_DUE_DATE`, `VITE_FEATURE_SOUL_BADGE` | no secrets; the browser only signs typed data |

## Design deal (tasteskill)
- Kind: software (fintech). Page type `software`, radius `sharp`.
- Palette: three stones (`#eeecea` ground, `#333231` ink, `#5c6b54` sage accent). PASS green and FAIL red are state colours, always with an icon and a word.
- Type: Host Grotesk (display 500, text 400) + JetBrains Mono for hashes and addresses.
- Landing hero: triptych (headline left, cycling collage of real product UI in the middle, one button on the right line).
- No shader effect, scene or photographs: the product UI (verdict, checklist, receipt) is the visual.

## Template component -> our component
| Template component | Ours | Decision |
|---|---|---|
| (none supplied) | all of `src/components/*` | built new |
