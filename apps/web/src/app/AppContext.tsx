import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Address, PublicConfig } from '../lib/api/types';
import { chain, config } from '../lib/config';
import * as w from '../lib/wallet';

interface WalletState {
  address?: Address;
  chainId?: number;
  connecting: boolean;
  error?: string;
}

interface AppState {
  publicConfig?: PublicConfig;
  configError?: string;
  reloadConfig: () => void;
  wallet: WalletState;
  onRightChain: boolean;
  connect: (purpose: w.Purpose) => Promise<Address | undefined>;
  disconnect: () => void;
  switchChain: () => Promise<boolean>;
  /** pages set this when the document on screen carries details.example = true */
  setPageExample: (v: boolean) => void;
  showExample: boolean;
  toast: (msg: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [publicConfig, setPublicConfig] = useState<PublicConfig>();
  const [configError, setConfigError] = useState<string>();
  const [wallet, setWallet] = useState<WalletState>({ connecting: false });
  const [pageExample, setPageExample] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>();
  const toastTimer = useRef<number>(undefined);

  const loadConfig = useCallback(() => api.getConfig().then((c) => { setPublicConfig(c); setConfigError(undefined); }, (e: Error) => setConfigError(e.message)), []);
  const reloadConfig = useCallback(() => void loadConfig(), [loadConfig]);
  useEffect(() => void loadConfig(), [loadConfig]);

  useEffect(
    () =>
      w.onWalletChange(async () => {
        const chainId = await w.currentChainId();
        setWallet((s) => ({ ...s, chainId }));
      }),
    [],
  );

  const connect = useCallback(async (purpose: w.Purpose) => {
    setWallet((s) => ({ ...s, connecting: true, error: undefined }));
    try {
      const { address, chainId } = await w.connect(purpose);
      setWallet({ address, chainId, connecting: false });
      return address;
    } catch (e) {
      setWallet((s) => ({ ...s, connecting: false, error: (e as Error).message }));
      return undefined;
    }
  }, []);

  const switchChain = useCallback(async () => {
    try {
      await w.ensureChain();
      setWallet((s) => ({ ...s, chainId: chain.id, error: undefined }));
      return true;
    } catch (e) {
      setWallet((s) => ({ ...s, error: (e as Error).message }));
      return false;
    }
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(undefined), 2400);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      publicConfig, configError, reloadConfig, wallet, connect, switchChain, toast, setPageExample,
      disconnect: () => setWallet({ connecting: false }),
      onRightChain: wallet.chainId === chain.id,
      showExample: config.exampleMode || pageExample || !!publicConfig?.exampleMode,
    }),
    [publicConfig, configError, reloadConfig, wallet, connect, switchChain, toast, pageExample],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <output aria-live="polite" className="sr-only">{toastMsg}</output>
      {toastMsg && <div className="toast" aria-hidden="true">{toastMsg}</div>}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Marks the current page as showing example data for as long as it is mounted. */
export function useExampleFlag(example: boolean | undefined) {
  const { setPageExample } = useApp();
  useEffect(() => {
    setPageExample(!!example);
    return () => setPageExample(false);
  }, [example, setPageExample]);
}
