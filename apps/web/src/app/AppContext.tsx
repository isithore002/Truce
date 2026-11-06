import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Address, PublicConfig } from '../lib/api/types';
import { chain, config } from '../lib/config';
import * as w from '../lib/wallet';
import { ConnectModal, type WalletChoice } from '../components/layout/ConnectModal';

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
  /** Opens the connect modal; resolves with the address once connected on the right network, or undefined if closed. */
  connect: (purpose: w.Purpose) => Promise<Address | undefined>;
  /** Connects without the modal (the mock wallet switching persona between merchant and buyer pages). */
  reconnect: (purpose: w.Purpose) => Promise<Address | undefined>;
  /** Name and icon of the wallet in use, as the wallet announced them. */
  walletInfo?: WalletChoice;
  disconnect: () => void;
  switchChain: () => Promise<boolean>;
  /** pages set this when the document on screen carries details.example = true */
  setPageExample: (v: boolean) => void;
  showExample: boolean;
  /** true when no real chain is behind the app: demo mode, or a server running CHAIN_MODE=mock. Payments are simulated. */
  chainSimulated: boolean;
  toast: (msg: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [publicConfig, setPublicConfig] = useState<PublicConfig>();
  const [configError, setConfigError] = useState<string>();
  const [wallet, setWallet] = useState<WalletState>({ connecting: false });
  const [pageExample, setPageExample] = useState(false);
  const [serverChain, setServerChain] = useState<string>();
  useEffect(() => {
    if (config.apiMode !== 'server') return;
    api.healthz().then((h) => setServerChain(h.chainMode), () => setServerChain(undefined));
  }, []);
  const [toastMsg, setToastMsg] = useState<string>();
  const toastTimer = useRef<number>(undefined);

  const loadConfig = useCallback(() => api.getConfig().then((c) => { setPublicConfig(c); setConfigError(undefined); }, (e: Error) => setConfigError(e.message)), []);
  const reloadConfig = useCallback(() => void loadConfig(), [loadConfig]);
  useEffect(() => void loadConfig(), [loadConfig]);

  useEffect(
    () =>
      // Follow the wallet: a new active account or network replaces ours; no account means the site was disconnected there.
      w.onWalletChange(async () => {
        const [chainId, account] = await Promise.all([w.currentChainId(), w.currentAccount()]);
        setWallet((s) => (!s.address ? { ...s, chainId } : account ? { ...s, address: account, chainId, error: undefined } : { connecting: false }));
      }),
    [],
  );

  const connectDirect = useCallback(async (purpose: w.Purpose) => {
    setWallet((s) => ({ ...s, connecting: true, error: undefined }));
    try {
      const { address, chainId } = await w.connect(purpose);
      setWallet({ address, chainId, connecting: false });
      return { address, chainId };
    } catch (e) {
      setWallet((s) => ({ ...s, connecting: false, error: (e as Error).message }));
      return { error: (e as Error).message };
    }
  }, []);
  const reconnect = useCallback(async (purpose: w.Purpose) => (await connectDirect(purpose)).address, [connectDirect]);

  const [walletInfo, setWalletInfo] = useState<WalletChoice>();
  const [picker, setPicker] = useState<{ purpose: w.Purpose; resolve: (a: Address | undefined) => void }>();
  const connect = useCallback((purpose: w.Purpose) => new Promise<Address | undefined>((resolve) => setPicker({ purpose, resolve })), []);
  const finishPicker = useCallback((address: Address | undefined, choice?: WalletChoice) => {
    setPicker((p) => {
      p?.resolve(address);
      return undefined;
    });
    if (address && choice) setWalletInfo({ name: choice.name, icon: choice.icon });
  }, []);
  const onPickerDone = useCallback((a: Address, c: WalletChoice) => finishPicker(a, c), [finishPicker]);
  const onPickerCancel = useCallback(() => finishPicker(undefined), [finishPicker]);

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
      publicConfig, configError, reloadConfig, wallet, connect, reconnect, walletInfo, switchChain, toast, setPageExample,
      disconnect: () => { setWallet({ connecting: false }); setWalletInfo(undefined); },
      onRightChain: wallet.chainId === chain.id,
      showExample: config.exampleMode || pageExample || !!publicConfig?.exampleMode,
      chainSimulated: config.apiMode === 'mock' || serverChain === 'mock',
    }),
    [publicConfig, configError, reloadConfig, wallet, connect, reconnect, walletInfo, switchChain, toast, pageExample, serverChain],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {picker && (
        <ConnectModal purpose={picker.purpose} connectDirect={connectDirect} switchChain={switchChain} onDone={onPickerDone} onCancel={onPickerCancel} />
      )}
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
