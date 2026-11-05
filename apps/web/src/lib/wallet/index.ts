import { createWalletClient, custom, parseSignature, type TypedDataDefinition, type WalletClient } from 'viem';
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
export const hasInjectedWallet = () => typeof window !== 'undefined' && !!window.ethereum;

let client: WalletClient | undefined;
function wallet(): WalletClient {
  if (!hasInjectedWallet()) throw new WalletError('NO_WALLET', 'No browser wallet found. Install one (for example MetaMask or Rabby) and reload.');
  client ??= createWalletClient({ chain, transport: custom(window.ethereum!) });
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

export function splitSignature(sig: Hex): { v: number; r: Hex; s: Hex } {
  const p = parseSignature(sig);
  const v = p.v !== undefined ? Number(p.v) : 27 + (p.yParity ?? 0);
  return { v, r: p.r, s: p.s };
}

export function onWalletChange(cb: () => void): () => void {
  if (isMockWallet() || !hasInjectedWallet()) return () => {};
  const eth = window.ethereum as unknown as { on?: (e: string, f: () => void) => void; removeListener?: (e: string, f: () => void) => void };
  eth.on?.('accountsChanged', cb);
  eth.on?.('chainChanged', cb);
  return () => {
    eth.removeListener?.('accountsChanged', cb);
    eth.removeListener?.('chainChanged', cb);
  };
}
