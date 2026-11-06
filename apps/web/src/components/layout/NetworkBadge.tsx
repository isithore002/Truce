import { useApp } from '../../app/AppContext';
import { config } from '../../lib/config';

export function NetworkBadge() {
  const { chainSimulated } = useApp();
  const mock = config.apiMode === 'mock';
  const label = mock ? 'Mock · 1874' : chainSimulated ? 'Mock chain · 1874' : 'Sepolia · 1874';
  return (
    <span className={`badge network ${chainSimulated ? 'badge--warn' : 'badge--info'}`} title="Whitechain Sepolia, chain id 1874">
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: 'currentColor' }} />
      {label}
      <span className="sr-only">{mock ? 'Mock mode: no network calls.' : chainSimulated ? 'The server runs a mock chain: payments are simulated.' : 'Whitechain Sepolia testnet.'}</span>
    </span>
  );
}
