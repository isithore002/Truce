import { whitechainSepolia } from 'viem/chains';

export type ApiMode = 'mock' | 'server';

export interface AppConfig {
  apiBase: string;
  apiMode: ApiMode;
  demoTools: boolean;
  exampleMode: boolean;
  features: { dueDate: boolean; soulBadge: boolean };
}

type Env = Partial<Record<string, string | boolean | undefined>>;

const on = (v: string | boolean | undefined) => v === true || v === '1' || v === 'true' || v === 'on';
/** Unset or empty means the default; anything else is read with on(). */
const flag = (v: string | boolean | undefined, dflt: boolean) => (v === undefined || v === '' ? dflt : on(v));

/** Pure so it can be tested; `config` below reads Vite's env once. */
export function parseConfig(env: Env): AppConfig {
  const mode = String(env.VITE_API_MODE ?? 'mock').toLowerCase();
  return {
    apiBase: String(env.VITE_API_BASE ?? 'http://localhost:8787').replace(/\/+$/, ''),
    apiMode: mode === 'server' ? 'server' : 'mock',
    // demo tools default on in mock mode, off in server mode
    demoTools: env.VITE_DEMO_TOOLS === undefined || env.VITE_DEMO_TOOLS === '' ? mode !== 'server' : on(env.VITE_DEMO_TOOLS),
    exampleMode: on(env.VITE_EXAMPLE_MODE),
    // both are built end to end (server routes T12, T13, T24, T25); set =0 to hide them. The Soul badge only shows on example invoices.
    features: { dueDate: flag(env.VITE_FEATURE_DUE_DATE, true), soulBadge: flag(env.VITE_FEATURE_SOUL_BADGE, true) },
  };
}

export const config: AppConfig = parseConfig(import.meta.env as unknown as Env);

/** viem's built-in chain definition for Whitechain Sepolia (id 1874). */
export const chain = whitechainSepolia;
export const CHAIN_ID = chain.id;
export const EXPLORER = chain.blockExplorers.default.url;

export const explorerTx = (hash: string, base: string = EXPLORER) => `${base}/tx/${hash}`;
export const explorerAddress = (addr: string, base: string = EXPLORER) => `${base}/address/${addr}`;
