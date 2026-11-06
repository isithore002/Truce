import { createPublicClient, createWalletClient, custom, getAddress, type Address, type EIP1193Provider } from "viem";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const WHITECHAIN_SEPOLIA = {
  chainId: "0x752", // 1874
  chainName: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.whitechain.io"],
  blockExplorerUrls: ["https://explorer.testnet.whitechain.io"],
};

export class WalletError extends Error {}

export function getProvider(): EIP1193Provider {
  if (!window.ethereum) throw new WalletError("No wallet found. Install MetaMask or Rabby, then reload this page.");
  return window.ethereum;
}

/** Turns wallet errors into something a buyer can act on. */
export function walletMessage(e: unknown): string {
  const err = e as { code?: number; message?: string; shortMessage?: string };
  if (e instanceof WalletError) return e.message;
  if (err?.code === 4001 || /user rejected|denied/i.test(err?.message ?? "")) return "You cancelled the request in your wallet.";
  if (err?.code === -32002) return "Your wallet already has a request open. Open it and approve or reject.";
  return err?.shortMessage ?? err?.message ?? "The wallet reported an error.";
}

export async function connect(): Promise<Address> {
  const accounts = (await getProvider().request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts[0]) throw new WalletError("The wallet did not share an account.");
  return getAddress(accounts[0]);
}

export async function currentAccount(): Promise<Address | undefined> {
  if (!window.ethereum) return undefined;
  const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
  return accounts[0] ? getAddress(accounts[0]) : undefined;
}

/** Calls back when the user switches account in the wallet (or disconnects). Returns an unsubscribe function. */
export function watchAccounts(cb: (account: Address | undefined) => void): () => void {
  const provider = window.ethereum as (EIP1193Provider & { on?: (e: string, f: (a: string[]) => void) => void; removeListener?: (e: string, f: (a: string[]) => void) => void }) | undefined;
  if (!provider?.on) return () => undefined;
  const handler = (accounts: string[]) => cb(accounts[0] ? getAddress(accounts[0]) : undefined);
  provider.on("accountsChanged", handler);
  return () => provider.removeListener?.("accountsChanged", handler);
}

/** Switches to Whitechain Sepolia, adding it to the wallet first if the wallet does not know it. */
export async function ensureChain(chainIdHex = WHITECHAIN_SEPOLIA.chainId): Promise<void> {
  const provider = getProvider();
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current.toLowerCase() === chainIdHex.toLowerCase()) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (e) {
    if ((e as { code?: number }).code === 4902 || /unrecognized chain|not added/i.test((e as Error).message ?? "")) {
      await provider.request({ method: "wallet_addEthereumChain", params: [WHITECHAIN_SEPOLIA] });
    } else throw e;
  }
}

const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const;

/** Reads the buyer's token balance through their own wallet's RPC. Returns undefined if it cannot be read. */
export async function tokenBalance(token: Address, holder: Address): Promise<bigint | undefined> {
  try {
    const client = createPublicClient({ transport: custom(getProvider()) });
    return await client.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [holder] });
  } catch {
    return undefined;
  }
}

/** An account object the invoice library can sign with, backed by the connected wallet. */
export function walletSigner(address: Address) {
  const client = createWalletClient({ transport: custom(getProvider()) });
  return {
    address,
    signTypedData: ((typed: never) => client.signTypedData({ account: address, ...(typed as object) } as never)) as never,
  };
}
