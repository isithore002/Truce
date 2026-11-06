import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { MOCK_ACCOUNTS } from '../../lib/api/fixtures';
import { config, explorerAddress } from '../../lib/config';
import { sameAddress, shortAddress } from '../../lib/format';
import { isMockWallet } from '../../lib/wallet';
import { Icon } from '../Icon';

/**
 * Connect; once connected, a menu with the full address (copy, explorer), the network, what this wallet is doing on
 * this page (signing as merchant or paying as buyer), shortcuts and Disconnect. "Switch network" when on another chain.
 */
export function WalletButton() {
  const { wallet, connect, reconnect, disconnect, onRightChain, switchChain, toast, publicConfig, walletInfo } = useApp();
  const { pathname } = useLocation();
  const purpose = pathname.startsWith('/merchant') || pathname.startsWith('/setup') ? 'merchant' : 'buyer';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLAnchorElement>(null);

  // Mock wallet: merchant pages act as Northlight, buyer pages as Beta Labs.
  useEffect(() => {
    if (isMockWallet() && wallet.address && !sameAddress(wallet.address, MOCK_ACCOUNTS[purpose])) void reconnect(purpose);
  }, [purpose, wallet.address, reconnect]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    firstItem.current?.focus();
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // The connect modal shows its own "Connected" step, so no toast here.
  const onConnect = () => connect(purpose);

  if (!wallet.address) {
    return (
      <button type="button" className="btn btn--secondary wallet-btn" onClick={() => void onConnect()} disabled={wallet.connecting}>
        {wallet.connecting ? <span className="wallet-btn__spin" aria-hidden="true" /> : <Icon name="wallet" size={18} />}
        {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }
  if (!onRightChain) {
    return (
      <button type="button" className="btn btn--secondary wallet-btn wallet-btn--warn" onClick={switchChain}>
        <Icon name="alert" size={18} />
        Switch to Whitechain Sepolia
      </button>
    );
  }

  const address = wallet.address;
  return (
    <div className="wallet-menu" ref={rootRef}>
      <button type="button" className="btn btn--secondary wallet-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="wallet-btn__avatar" aria-hidden="true" style={{ ['--h' as string]: parseInt(address.slice(2, 6), 16) % 360 }} />
        <span className="mono">{shortAddress(address)}</span>
        <svg className="wallet-btn__chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="wallet-menu__panel" role="menu" aria-label="Wallet">
          <div className="wallet-menu__head">
            <span className="wallet-btn__avatar wallet-btn__avatar--lg" aria-hidden="true" style={{ ['--h' as string]: parseInt(address.slice(2, 6), 16) % 360 }} />
            <div>
              <span className="wallet-menu__role">{purpose === 'merchant' ? 'Signing invoices as merchant' : 'Paying as buyer'}</span>
              <code className="wallet-menu__addr">{address}</code>
            </div>
          </div>
          <div className="wallet-menu__net">
            <span className="wallet-menu__dot" aria-hidden="true" />
            {walletInfo?.icon && <img src={walletInfo.icon} alt="" width={16} height={16} className="wallet-menu__wicon" />}
            {walletInfo ? `${walletInfo.name} · ` : ''}{config.apiMode === 'mock' ? 'Mock wallet · Whitechain Sepolia (1874)' : 'Whitechain Sepolia (1874)'}
          </div>
          <div className="wallet-menu__row">
            <button type="button" role="menuitem" className="wallet-menu__chip" onClick={() => void navigator.clipboard?.writeText(address).then(() => toast('Address copied'))}><Icon name="copy" size={14} />Copy address</button>
            <a role="menuitem" className="wallet-menu__chip" href={explorerAddress(address, publicConfig?.explorerUrl)} target="_blank" rel="noreferrer"><Icon name="external" size={14} />Explorer</a>
          </div>
          <nav className="wallet-menu__links">
            <Link ref={firstItem} role="menuitem" to="/merchant"><Icon name="file" size={16} />Merchant dashboard</Link>
            <Link role="menuitem" to="/setup"><Icon name="globe" size={16} />Domain setup</Link>
            <Link role="menuitem" to="/verify"><Icon name="shield" size={16} />Verify an invoice</Link>
          </nav>
          <button type="button" role="menuitem" className="wallet-menu__out" onClick={() => { disconnect(); setOpen(false); toast('Wallet disconnected'); }}>
            <Icon name="x" size={16} />Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
