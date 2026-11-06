import { config } from '../../lib/config';
import { Icon } from '../Icon';

/**
 * Shown on every page while the app runs in demo (mock) mode: no server and no chain, so every "payment" is
 * simulated and produces no transaction on Whitechain. Server mode (VITE_API_MODE=server) shows nothing here.
 */
export function MockModeBanner({ mode = config.apiMode }: { mode?: 'mock' | 'server' }) {
  if (mode !== 'mock') return null;
  return (
    <div className="mock-band" role="alert" data-testid="mock-mode-banner">
      <div className="wrap">
        <Icon name="alert" size={16} />
        <span>
          <strong>DEMO MODE: nothing here is on the blockchain.</strong> There is no server and no chain, so payments are simulated and make no transaction.
          For real testnet transactions, run the server and start the app with <code>VITE_API_MODE=server</code> (see the README).
        </span>
      </div>
    </div>
  );
}
