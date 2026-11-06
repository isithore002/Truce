# Deploy the web app on Vercel

Only the web app (`apps/web`, a static Vite build) goes on Vercel. The API server does **not**: it is one long-running process with a timer (the due-date scheduler), a JSON-file store and in-memory rate limits, none of which fit serverless functions. See "Real transactions" below.

Nothing here has been deployed by us: there is no Vercel login in the build environment. The config below was checked by running the same install and build commands locally (`npm ci --dry-run`, `npm run build` in `apps/web`), not on Vercel.

## 1. Demo-mode site (no server, no real transactions)

The app starts in demo (mock) mode when no environment variables are set. Every page shows a red **DEMO MODE** banner and payments are simulated, so this is a way to try the screens, not to make a payment.

1. Push `main` to GitHub (it already contains `apps/web/vercel.json`).
2. Vercel dashboard: **Add New, Project**, import `isithore002/Truce`.
3. Set **Root Directory** to `apps/web`. Leave "Include source files outside of the Root Directory" **on** (the app imports the workspace package `packages/invoice-lib`).
4. Framework preset: **Vite** (detected). The install, build and output settings come from `apps/web/vercel.json`:
   - install: `cd ../.. && npm ci` (installs the whole workspace from the root lockfile)
   - build: `npm run build` (`tsc -p . && vite build`)
   - output: `dist`
   - every path rewrites to `index.html`, so `/pay/<hash>` and `/verify` work when opened directly
5. No environment variables. Click **Deploy**.
6. Open the URL. Check: the home page loads, the red DEMO MODE banner is visible, `/verify` opens directly and `/pay/<any hash>` shows a not-found message, not a Vercel 404.

Node is pinned to 22.x in `apps/web/package.json`.

## 2. Real transactions (web on Vercel, API somewhere that keeps a process running)

The web app on Vercel can talk to the API if the API is on **HTTPS** (a Vercel page cannot call plain HTTP). Hosts that fit: Render, Railway or Fly with an always-on plan and a persistent disk, or your own machine behind a tunnel for a demo. Free tiers that sleep can stop the scheduler.

On the API host (see `.env.example`):

```
CHAIN_MODE=testnet
DEMO_DOMAINS=1
HOST=0.0.0.0
PORT=<the host's port>
WEB_ORIGIN=https://<your-vercel-url>          # the API allows exactly this one origin, no trailing slash
PUBLIC_BASE_URL=https://<your-vercel-url>     # where pay links point
STORE_PATH=<a path on a persistent disk>
RELAYER_PK=<throwaway testnet key, set as a host secret>
```

Run `npm ci && npm run server` from the repo root. The relayer wallet needs a little test WBT; the buyer needs test USDT.

On Vercel, add these project environment variables and **redeploy** (they are read at build time):

```
VITE_API_MODE=server
VITE_API_BASE=https://<your-api-host>
VITE_EXAMPLE_MODE=1
```

Everything starting with `VITE_` is public in the built site. Never put a key there.

Check after deploying: no red DEMO MODE banner, the browser's network tab shows calls to your API (not blocked by CORS), and `GET https://<your-api-host>/healthz` answers `mode: testnet`.

## Limits

- The site does not make anything production-ready: the contract is unaudited, it is testnet only and there is no merchant login (see the README's limitations).
- A public API with a funded relayer can be used by anyone who finds it. It has a per-IP rate limit and a daily WBT budget, so keep the relayer balance small.
- The domain check and demo-domain registry run on the API host, so they need that host's persistent disk (`DEMO_REGISTRY_DIR`, default next to the store).
- If you share the Vercel link, say which mode it is in. A demo-mode link must not be described as a live deployment.
