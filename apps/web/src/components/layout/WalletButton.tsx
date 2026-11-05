import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { MOCK_ACCOUNTS } from '../../lib/api/fixtures';
import { sameAddress, shortAddress } from '../../lib/format';
import { isMockWallet } from '../../lib/wallet';
import { Icon } from '../Icon';

/** Connect, show the account, and offer "Switch to Whitechain Sepolia" when the wallet is on another chain. */
export function WalletButton() {
  const { wallet, connect, disconnect, onRightChain, switchChain } = useApp();
  const { pathname } = useLocation();
  const purpose = pathname.startsWith('/merchant') || pathname.startsWith('/setup') ? 'merchant' : 'buyer';

  // Mock wallet: merchant pages act as Northlight, buyer pages as Beta Labs.
  useEffect(() => {
    if (isMockWallet() && wallet.address && !sameAddress(wallet.address, MOCK_ACCOUNTS[purpose])) void connect(purpose);
  }, [purpose, wallet.address, connect]);

  if (!wallet.address) {
    return (
      <button type="button" className="btn btn--secondary" onClick={() => connect(purpose)} disabled={wallet.connecting}>
        <Icon name="wallet" size={18} />
        {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }
  if (!onRightChain) {
    return (
      <button type="button" className="btn btn--secondary" onClick={switchChain}>
        <Icon name="alert" size={18} />
        Switch network
      </button>
    );
  }
  return (
    <button type="button" className="btn btn--secondary" onClick={disconnect} title={`Connected: ${wallet.address}. Click to disconnect.`}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--ok)' }} />
      <span className="mono">{shortAddress(wallet.address)}</span>
      <span className="sr-only">Disconnect wallet</span>
    </button>
  );
}
