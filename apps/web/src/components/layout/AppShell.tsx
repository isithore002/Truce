import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { config } from '../../lib/config';
import { usePageProgress } from '../../lib/motion';
import { Icon, Logo } from '../Icon';
import { ExampleBanner } from './ExampleBanner';
import { LimitsFooter } from './LimitsFooter';
import { NetworkBadge } from './NetworkBadge';
import { ScenarioBar } from './ScenarioBar';
import { WalletButton } from './WalletButton';

const LINKS = [
  { to: '/verify', label: 'Verify' },
  { to: '/merchant', label: 'Invoices' },
  { to: '/setup', label: 'Setup' },
  ...(config.demoTools ? [{ to: '/demo', label: 'Demo' }] : []),
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const progress = usePageProgress();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="page">
      <header className="nav">
        <div className="wrap">
          <a className="skip" href="#main">Skip to content</a>
          <Link to="/" className="logo" aria-label="Truce home">
            <Logo />
            Truce
          </Link>
          <nav aria-label="Main">
            <div id="main-nav" className={`nav__links${open ? ' is-open' : ''}`}>
              {LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)}>{l.label}</NavLink>
              ))}
            </div>
          </nav>
          <div className="nav__end">
            <NetworkBadge />
            <WalletButton />
            <button
              type="button"
              className="icon-btn icon-btn--menu nav__menu"
              aria-expanded={open}
              aria-controls="main-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name={open ? 'x' : 'menu'} />
            </button>
          </div>
        </div>
        <span className="nav__progress" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />
      </header>
      <ExampleBanner />
      {config.demoTools && config.apiMode === 'mock' && <ScenarioBar />}
      <main id="main" tabIndex={-1}>{children}</main>
      <LimitsFooter />
    </div>
  );
}
