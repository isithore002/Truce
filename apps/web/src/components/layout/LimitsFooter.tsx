import { Link } from 'react-router-dom';
import { config } from '../../lib/config';

const YEAR = new Date().getFullYear();

export function LimitsFooter() {
  return (
    <footer className="limits">
      <div className="wrap">
        <p>
          <strong>Testnet only. Amounts and addresses are public. A signed payment is a commitment, not locked funds.</strong>
        </p>
        <p className="row" style={{ gap: 'var(--s-5)' }}>
          <Link className="link" to="/verify">Verify an invoice</Link>
          <Link className="link" to="/setup">Merchant setup</Link>
          <span>Truce {YEAR} · {config.apiMode === 'mock' ? 'Mock data' : 'Whitechain Sepolia'}</span>
        </p>
      </div>
    </footer>
  );
}
