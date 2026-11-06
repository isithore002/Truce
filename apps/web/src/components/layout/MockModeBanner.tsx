import { config } from '../../lib/config';
import { Icon } from '../Icon';

/**
 * Shown on every page while the app runs in demo (mock) mode: no server and no chain, so every "payment" is
 * simulated and produces no transaction on Whitechain. Server mode (VITE_API_MODE=server) shows nothing here.
 */
export function MockModeBanner({ mode = config.apiMode }: { mode?: 'mock' | 'server' }) {
  if (mode !== 'mock') return null;
  return (
    <div className="mock-band" role="alert" data-testid="mock-mode-banner" title="For real testnet transactions, run the server and start the app with VITE_API_MODE=server (see the README).">
      <div className="wrap">
        <Icon name="alert" size={16} />
        <span>
          <strong>DEMO MODE.</strong> Payments here are simulated and nothing is on the blockchain.
        </span>
      </div>
    </div>
  );
}
