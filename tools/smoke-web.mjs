// Runs the opt-in web smoke test (apps/web/src/test/serverSmoke.test.ts) against a running server.
//   DEMO_DOMAINS=1 PORT=8790 npm run server     then     npm run smoke:web
// Env: VITE_API_BASE (default http://127.0.0.1:8790). MERCHANT_PK and PAYER_PK come from .env (never printed).
import { spawnSync } from "node:child_process";

const env = { ...process.env, SMOKE_API: "1", VITE_API_MODE: "server", VITE_API_BASE: process.env.VITE_API_BASE || "http://127.0.0.1:8790" };
const r = spawnSync("npx", ["vitest", "run", "src/test/serverSmoke.test.ts"], { cwd: "apps/web", stdio: "inherit", shell: true, env });
process.exit(r.status ?? 1);
