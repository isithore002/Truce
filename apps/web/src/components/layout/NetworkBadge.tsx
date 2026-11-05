import { config } from '../../lib/config';

export function NetworkBadge() {
  const mock = config.apiMode === 'mock';
  return (
    <span className={`badge network ${mock ? 'badge--warn' : 'badge--info'}`} title="Whitechain Sepolia, chain id 1874">
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: 'currentColor' }} />
      {mock ? 'Mock · 1874' : 'Sepolia · 1874'}
      <span className="sr-only">{mock ? 'Mock mode: no network calls.' : 'Whitechain Sepolia testnet.'}</span>
    </span>
  );
}
