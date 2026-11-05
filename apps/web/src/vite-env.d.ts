/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_MODE?: string;
  readonly VITE_DEMO_TOOLS?: string;
  readonly VITE_EXAMPLE_MODE?: string;
  readonly VITE_FEATURE_DUE_DATE?: string;
  readonly VITE_FEATURE_SOUL_BADGE?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

interface Window { ethereum?: import('viem').EIP1193Provider }
