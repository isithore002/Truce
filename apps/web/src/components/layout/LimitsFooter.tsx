import { Link } from 'react-router-dom';
import { config, explorerAddress } from '../../lib/config';
import { useApp } from '../../app/AppContext';
import { Logo } from '../Icon';

const YEAR = new Date().getFullYear();

export function LimitsFooter() {
  const { publicConfig } = useApp();
  const settler = publicConfig?.settler;
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__cols">
          <Link to="/" className="logo" aria-label="Truce home"><Logo />Truce</Link>
          <nav aria-label="For buyers">
            <h2>For buyers</h2>
            <Link to="/verify">Check an invoice</Link>
            <Link to="/verify">Public verify page</Link>
          </nav>
          <nav aria-label="For merchants">
            <h2>For merchants</h2>
            <Link to="/setup">Set up your domain</Link>
            <Link to="/merchant">Invoices and CSV</Link>
          </nav>
          <nav aria-label="On chain">
            <h2>On chain</h2>
            {settler ? <a href={explorerAddress(settler, publicConfig?.explorerUrl)} target="_blank" rel="noreferrer">InvoiceSettler</a> : <span>InvoiceSettler</span>}
            <span>Whitechain Sepolia · 1874</span>
            {config.demoTools && <Link to="/demo">Demo tools</Link>}
          </nav>
        </div>
        <div className="foot__base">
          <span>Truce {YEAR} · {config.apiMode === 'mock' ? 'Mock data' : 'Whitechain Sepolia'}</span>
        </div>
        <p className="foot__limits">
          <strong>Testnet only. Amounts and addresses are public. A signed payment is a commitment, not locked funds.</strong>{' '}
          Truce is a hackathon project. Example merchants such as Northlight Design Studio and Beta Labs are fictional and labelled EXAMPLE DATA.
          The health check before a due date is a snapshot, not a lock.
        </p>
      </div>
    </footer>
  );
}
