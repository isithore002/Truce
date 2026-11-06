import { createWalletClient, custom, type TypedDataDefinition, type WalletClient } from 'viem';
import { MOCK_ACCOUNTS } from '../api/fixtures';
import type { Address, Hex } from '../api/types';
import { chain, config } from '../config';
import { randomHex } from '../invoiceLib';

/**
 * Wallet helpers. The browser only ever signs typed data built by @truce/invoice-lib; it never holds a key
 * and never sends a transaction (the relayer does). Mock mode uses a pretend wallet with fixed example accounts.
 */

export type Purpose = 'merchant' | 'buyer';

export class WalletError extends Error {
  constructor(public code: 'NO_WALLET' | 'REJECTED' | 'WRONG_CHAIN' | 'UNKNOWN', message: string) {
    super(message);
    this.name = 'WalletError';
  }
}

export const isMockWallet = () => config.apiMode === 'mock';

/* ---------- which browser wallet: EIP-6963 discovery, falling back to window.ethereum ---------- */

type Eip1193 = NonNullable<Window['ethereum']>;
type Listener = (e: string, f: () => void) => void;

/** A wallet that announced itself (EIP-6963). Name and icon come from the wallet itself. */
export interface DiscoveredWallet {
  uuid: string;
  name: string;
  /** data: URI supplied by the wallet */
  icon: string;
  rdns: string;
  provider: Eip1193;
}

let selected: Eip1193 | undefined;
const currentProvider = (): Eip1193 | undefined => selected ?? (typeof window !== 'undefined' ? window.ethereum : undefined);
export const hasInjectedWallet = () => !!currentProvider();

/** Listens for wallets announcing themselves and asks them to announce now. Returns an unsubscribe function. */
export function discoverWallets(onChange: (wallets: DiscoveredWallet[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const found = new Map<string, DiscoveredWallet>();
  const onAnnounce = (e: Event) => {
    const d = (e as CustomEvent<{ info: Omit<DiscoveredWallet, 'provider'>; provider: Eip1193 }>).detail;
    if (!d?.info?.uuid || !d.provider) return;
    found.set(d.info.uuid, { ...d.info, provider: d.provider });
    onChange([...found.values()]);
  };
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
}

let client: WalletClient | undefined;
const changeListeners = new Set<() => void>();
const fire = () => changeListeners.forEach((f) => f());
function attach(p?: Eip1193) {
  const eth = p as unknown as { on?: Listener } | undefined;
  eth?.on?.('accountsChanged', fire);
  eth?.on?.('chainChanged', fire);
}
function detach(p?: Eip1193) {
  const eth = p as unknown as { removeListener?: Listener } | undefined;
  eth?.removeListener?.('accountsChanged', fire);
  eth?.removeListener?.('chainChanged', fire);
}

/** Use this wallet for connect, chain switching and signing (undefined = the default window.ethereum). */
export function selectProvider(p?: Eip1193) {
  if (p === selected) return;
  if (changeListeners.size) detach(currentProvider());
  selected = p;
  client = undefined;
  if (changeListeners.size) attach(currentProvider());
}

function wallet(): WalletClient {
  const p = currentProvider();
  if (!p) throw new WalletError('NO_WALLET', 'No browser wallet found. Install one (for example MetaMask or Rabby) and reload.');
  client ??= createWalletClient({ chain, transport: custom(p) });
  return client;
}

function mapError(e: unknown): WalletError {
  const err = e as { code?: number; shortMessage?: string; message?: string; name?: string };
  if (e instanceof WalletError) return e;
  if (err?.code === 4001 || err?.name === 'UserRejectedRequestError') return new WalletError('REJECTED', 'You declined the request in your wallet. Nothing was signed.');
  return new WalletError('UNKNOWN', err?.shortMessage ?? err?.message ?? 'The wallet returned an error.');
}

export async function connect(purpose: Purpose): Promise<{ address: Address; chainId: number }> {
  if (isMockWallet()) {
    await new Promise((r) => setTimeout(r, 300));
    return { address: MOCK_ACCOUNTS[purpose], chainId: chain.id };
  }
  try {
    const [address] = await wallet().requestAddresses();
    if (!address) throw new WalletError('UNKNOWN', 'The wallet returned no account.');
    return { address, chainId: await wallet().getChainId() };
  } catch (e) {
    throw mapError(e);
  }
}

export async function currentChainId(): Promise<number | undefined> {
  if (isMockWallet()) return chain.id;
  if (!hasInjectedWallet()) return undefined;
  try {
    return await wallet().getChainId();
  } catch {
    return undefined;
  }
}

/** Switch to Whitechain Sepolia (1874); add it from viem's built-in definition if the wallet does not know it. */
export async function ensureChain(): Promise<void> {
  if (isMockWallet()) return;
  const w = wallet();
  if ((await w.getChainId()) === chain.id) return;
  try {
    await w.switchChain({ id: chain.id });
  } catch (e) {
    const code = (e as { code?: number; cause?: { code?: number } }).code ?? (e as { cause?: { code?: number } }).cause?.code;
    if (code === 4902 || /unrecognized|not been added|unknown chain/i.test(String((e as Error).message))) {
      try {
        await w.addChain({ chain });
      } catch (e2) {
        throw mapError(e2);
      }
    } else throw mapError(e);
  }
  if ((await w.getChainId()) !== chain.id) throw new WalletError('WRONG_CHAIN', 'Switch your wallet to Whitechain Sepolia (chain 1874) to continue.');
}

export async function signTypedData(account: Address, typedData: TypedDataDefinition): Promise<Hex> {
  if (isMockWallet()) {
    await new Promise((r) => setTimeout(r, 900));
    return `${randomHex(64)}1b` as Hex;
  }
  try {
    return await wallet().signTypedData({ account, ...typedData } as Parameters<WalletClient['signTypedData']>[0]);
  } catch (e) {
    throw mapError(e);
  }
}

/** Account or network changed in the wallet in use. Follows the wallet when a different one is selected. */
export function onWalletChange(cb: () => void): () => void {
  if (isMockWallet()) return () => {};
  if (changeListeners.size === 0) attach(currentProvider());
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
    if (changeListeners.size === 0) detach(currentProvider());
  };
}
