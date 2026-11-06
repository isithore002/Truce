import { useEffect, useRef, useState } from 'react';
import { MOCK_ACCOUNTS } from '../../lib/api/fixtures';
import type { Address } from '../../lib/api/types';
import { chain } from '../../lib/config';
import { shortAddress } from '../../lib/format';
import * as w from '../../lib/wallet';
import { Icon } from '../Icon';

/*
  Connect flow: choose a wallet (EIP-6963 discovery, names and icons supplied by the wallets themselves; mock mode offers
  the demo wallet), approve in the wallet, switch to Whitechain Sepolia (1874) if needed, connected.
  The wallet calls themselves stay in lib/wallet; this file is only the steps around them.
*/

export interface WalletChoice { name: string; icon?: string; provider?: w.DiscoveredWallet['provider'] }

type Step = 'choose' | 'connecting' | 'network' | 'done' | 'error';

interface Props {
  purpose: w.Purpose;
  connectDirect: (purpose: w.Purpose) => Promise<{ address?: Address; chainId?: number; error?: string }>;
  switchChain: () => Promise<boolean>;
  onDone: (address: Address, choice: WalletChoice) => void;
  onCancel: () => void;
}

const PERSONA = { merchant: 'Northlight Design Studio', buyer: 'Beta Labs' } as const;

export function ConnectModal({ purpose, connectDirect, switchChain, onDone, onCancel }: Props) {
  const mock = w.isMockWallet();
  const [found, setFound] = useState<w.DiscoveredWallet[]>([]);
  const [step, setStep] = useState<Step>('choose');
  const [choice, setChoice] = useState<WalletChoice>();
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [error, setError] = useState<string>();
  const [switching, setSwitching] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => (mock ? undefined : w.discoverWallets(setFound)), [mock]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [onCancel]);

  useEffect(() => {
    if (step !== 'done' || !address || !choice) return;
    const t = window.setTimeout(() => onDone(address, choice), 900);
    return () => window.clearTimeout(t);
  }, [step, address, choice, onDone]);

  async function pick(c: WalletChoice) {
    setChoice(c);
    setError(undefined);
    setStep('connecting');
    if (!mock) w.selectProvider(c.provider);
    const r = await connectDirect(purpose);
    if (!r.address) {
      setError(r.error ?? 'The wallet did not connect.');
      setStep('error');
      return;
    }
    setAddress(r.address);
    setChainId(r.chainId);
    setStep(r.chainId === chain.id ? 'done' : 'network');
  }

  async function doSwitch() {
    setSwitching(true);
    const ok = await switchChain();
    setSwitching(false);
    if (ok) setStep('done');
    else { setError('The network did not switch. Approve the request in your wallet, or add Whitechain Sepolia (chain 1874) and try again.'); setStep('error'); }
  }

  const options: WalletChoice[] = mock
    ? [{ name: 'Demo wallet' }]
    : found.length
      ? found.map((f) => ({ name: f.name, icon: f.icon, provider: f.provider }))
      : w.hasInjectedWallet() ? [{ name: 'Browser wallet' }] : [];

  return (
    <>
      <div className="cw-back" onClick={step === 'connecting' ? undefined : onCancel} aria-hidden="true" />
      <div className="cw" role="dialog" aria-modal="true" aria-labelledby="cw-title" ref={dialogRef}>
        <div className="cw__head">
          <div>
            <h2 id="cw-title">{step === 'done' ? 'Wallet connected' : step === 'network' ? 'Switch network' : 'Connect a wallet'}</h2>
            <p>{purpose === 'merchant' ? 'To sign invoices as the merchant.' : 'To pay this invoice.'}</p>
          </div>
          <button type="button" className="icon-btn icon-btn--menu" aria-label="Close" onClick={onCancel}><Icon name="x" /></button>
        </div>

        <ol className="cw__steps" aria-label="Progress">
          {['Choose', 'Approve', 'Network'].map((s, i) => {
            const at = step === 'choose' ? 0 : step === 'connecting' || step === 'error' ? 1 : step === 'network' ? 2 : 3;
            return <li key={s} data-state={i < at ? 'done' : i === at ? 'on' : 'todo'}><span>{i < at ? <Icon name="check" size={12} /> : i + 1}</span>{s}</li>;
          })}
        </ol>

        <div className="cw__body" aria-live="polite">
          {step === 'choose' && (
            options.length ? (
              <ul className="cw__list">
                {options.map((o) => (
                  <li key={o.name}>
                    <button type="button" className="cw__opt" onClick={() => void pick(o)}>
                      {o.icon ? <img src={o.icon} alt="" width={36} height={36} /> : <span className="cw__opt-icon" aria-hidden="true"><Icon name="wallet" size={18} /></span>}
                      <span className="cw__opt-text">
                        <strong>{o.name}</strong>
                        <small>{mock ? `Signs as ${PERSONA[purpose]} · ${shortAddress(MOCK_ACCOUNTS[purpose])} · EXAMPLE DATA` : o.provider ? 'Detected in this browser' : 'Injected wallet'}</small>
                      </span>
                      <Icon name="arrow" size={16} className="cw__opt-go" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="cw__empty">
                <span className="cw__opt-icon" aria-hidden="true"><Icon name="wallet" size={20} /></span>
                <strong>No wallet found in this browser</strong>
                <p>Install a browser wallet that supports Whitechain Sepolia, then reload this page.</p>
                <div className="cw__links">
                  <a className="link" href="https://metamask.io/download/" target="_blank" rel="noreferrer">Get MetaMask <Icon name="external" size={13} /></a>
                  <a className="link" href="https://rabby.io/" target="_blank" rel="noreferrer">Get Rabby <Icon name="external" size={13} /></a>
                </div>
              </div>
            )
          )}

          {step === 'connecting' && choice && (
            <div className="cw__wait">
              <span className="cw__ring" aria-hidden="true">{choice.icon ? <img src={choice.icon} alt="" width={40} height={40} /> : <Icon name="wallet" size={24} />}</span>
              <strong>{mock ? 'Connecting the demo wallet…' : `Approve the connection in ${choice.name}`}</strong>
              <p>{mock ? 'No real wallet is used in mock mode.' : 'Check the wallet window. Connecting shares your address only.'}</p>
            </div>
          )}

          {step === 'network' && (
            <div className="cw__wait">
              <span className="cw__ring cw__ring--warn" aria-hidden="true"><Icon name="globe" size={24} /></span>
              <strong>Switch to Whitechain Sepolia</strong>
              <p>Your wallet is on chain {chainId ?? 'unknown'}. Truce runs on Whitechain Sepolia (chain {chain.id}); your wallet will ask to switch, or to add the network first.</p>
              <button type="button" className="btn btn--primary btn--block" onClick={() => void doSwitch()} disabled={switching}>
                {switching ? 'Waiting for the wallet…' : 'Switch network'}
              </button>
            </div>
          )}

          {step === 'done' && address && (
            <div className="cw__wait cw__wait--ok">
              <span className="cw__ring cw__ring--ok" aria-hidden="true"><Icon name="check" size={26} /></span>
              <strong>Connected{choice ? ` with ${choice.name}` : ''}</strong>
              <code>{shortAddress(address)}</code>
            </div>
          )}

          {step === 'error' && (
            <div className="cw__wait">
              <span className="cw__ring cw__ring--bad" aria-hidden="true"><Icon name="x" size={24} /></span>
              <strong>Not connected</strong>
              <p role="alert">{error}</p>
              <div className="cw__links">
                {choice && <button type="button" className="btn btn--primary" onClick={() => void pick(choice)}>Try again</button>}
                <button type="button" className="btn btn--secondary" onClick={() => setStep('choose')}>Choose another wallet</button>
              </div>
            </div>
          )}
        </div>

        <p className="cw__foot"><Icon name="shield" size={14} />Truce never asks for a seed phrase. Every signature is shown in your wallet first, and the relayer pays the gas.</p>
      </div>
    </>
  );
}
