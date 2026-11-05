import '../../styles/landing.css';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { config } from '../../lib/config';
import { FragChecks, FragFile, FragInvoice, FragPay, FragPin, FragReceipt, FragTimeline, FragVerdict } from './Fragments';

/*
  tasteskill deal: kind software (fintech) · palette three-stones · type host (Host Grotesk + JetBrains Mono) · radius sharp
  hero triptych · ground paper · no shader effect, no scene, no photographs (the product UI is the visual)
*/

type Piece = { x: number; y: number; w: number; node: ReactNode };

const SETS: { name: string; pieces: Piece[] }[] = [
  {
    name: 'An honest invoice passes',
    pieces: [
      { x: 0, y: 2, w: 62, node: <FragInvoice /> },
      { x: 30, y: 38, w: 66, node: <FragVerdict pass /> },
      { x: 4, y: 58, w: 58, node: <FragChecks /> },
      { x: 58, y: 80, w: 38, node: <FragPay /> },
    ],
  },
  {
    name: 'A swapped payout wallet fails',
    pieces: [
      { x: 36, y: 2, w: 60, node: <FragInvoice payout="0xBadC…9d37" bad /> },
      { x: 0, y: 34, w: 68, node: <FragVerdict pass={false} /> },
      { x: 30, y: 54, w: 62, node: <FragChecks fail /> },
      { x: 0, y: 82, w: 40, node: <FragPay disabled /> },
    ],
  },
  {
    name: 'Paid, pinned, on the record',
    pieces: [
      { x: 0, y: 0, w: 70, node: <FragFile /> },
      { x: 44, y: 30, w: 52, node: <FragReceipt /> },
      { x: 2, y: 52, w: 44, node: <FragTimeline /> },
      { x: 34, y: 80, w: 62, node: <FragPin /> },
    ],
  },
];

function useCycle(n: number, ms: number, paused: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => window.clearInterval(t);
  }, [n, ms, paused]);
  return i;
}

function Collage() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [paused, setPaused] = useState(!!reduced);
  const [hover, setHover] = useState(false);
  const active = useCycle(SETS.length, 2800, paused || hover);
  return (
    <div className="collage" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-roledescription="slideshow" aria-label="Truce screens">
      {SETS.map((s, i) => (
        <div key={s.name} className={`collage__set${i === active ? ' is-on' : ''}`} aria-hidden={i !== active}>
          <span className="sr-only">{s.name}</span>
          {s.pieces.map((p, j) => (
            <div key={j} className="collage__piece" style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%` }}>{p.node}</div>
          ))}
        </div>
      ))}
      <div className="collage__dots" aria-hidden="true">
        {SETS.map((s, i) => <span key={s.name} className={i === active ? 'is-on' : undefined} />)}
      </div>
      <button type="button" className="collage__pause" aria-pressed={paused} aria-label={paused ? 'Play the screens' : 'Pause the screens'} onClick={() => setPaused((p) => !p)}>
        {paused ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5l8 5-8 5z" fill="currentColor" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 5h3v10H6zM11 5h3v10h-3z" fill="currentColor" /></svg>}
      </button>
    </div>
  );
}

function Settler() {
  return (
    <div className="diagram card" aria-label="How the contract routes a payment">
      <svg viewBox="0 0 560 360" role="img" aria-labelledby="dg-t">
        <title id="dg-t">A signed invoice enters InvoiceSettler. It pays the signed payout wallet and refuses a swapped one.</title>
        <path className="dg-line" d="M120 180 H220" />
        <path className="dg-line" d="M340 180 C390 180 390 90 440 90" />
        <path className="dg-line dg-line--bad" d="M340 180 C390 180 390 270 440 270" />
        <path className="dg-pulse" d="M120 180 H220" />
        <path className="dg-pulse dg-pulse--2" d="M340 180 C390 180 390 90 440 90" />
        <g className="dg-node"><rect x="10" y="146" width="110" height="68" rx="6" /><text x="65" y="176">Signed</text><text x="65" y="196">invoice</text></g>
        <g className="dg-node dg-node--main"><rect x="220" y="136" width="120" height="88" rx="6" /><text x="280" y="176">Invoice</text><text x="280" y="196">Settler</text></g>
        <g className="dg-node dg-node--ok"><rect x="440" y="56" width="110" height="68" rx="6" /><text x="495" y="86">Signed</text><text x="495" y="106">payout ✓</text></g>
        <g className="dg-node dg-node--bad"><rect x="440" y="236" width="110" height="68" rx="6" /><text x="495" y="266">Swapped</text><text x="495" y="286">wallet ✕</text></g>
      </svg>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing">
      <section className="hero-tri" aria-labelledby="hero-h1">
        <div className="wrap hero-tri__grid">
          <div className="hero-tri__text">
            <h1 id="hero-h1">USDT invoices buyers can verify</h1>
            <p>Buyers check the payout wallet against the merchant’s own domain before paying. Runs on Whitechain Sepolia testnet, chain 1874.</p>
          </div>
          <Collage />
          <div className="hero-tri__action">
            <Link className="btn btn--primary hero-tri__btn" to="/verify">Check an invoice<Icon name="arrow" className="arrow" /></Link>
            <Link className="link small" to="/setup">or set up your domain</Link>
          </div>
        </div>
      </section>

      <section className="l-sec" id="how" aria-labelledby="how-h">
        <div className="wrap">
          <h2 id="how-h">Three steps from invoice to payment</h2>
          <p className="l-sub measure">One file on your domain, one signature per invoice, one signature from the buyer.</p>
          <div className="l-cards">
            <article className="card l-card">
              <div className="l-card__visual"><FragFile /></div>
              <h3>Publishes the wallets on your domain</h3>
              <p>Upload truce.json naming your signing and payout wallets.</p>
            </article>
            <article className="card l-card">
              <div className="l-card__visual"><FragInvoice /></div>
              <h3>Signs each invoice with your wallet</h3>
              <p>The payout wallet and amount are fixed by your signature.</p>
            </article>
            <article className="card l-card">
              <div className="l-card__visual"><FragChecks /></div>
              <h3>Shows the buyer PASS or FAIL</h3>
              <p>Ten checks run against your domain before the Pay button unlocks.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="l-sec l-sec--alt" id="attack" aria-labelledby="attack-h">
        <div className="wrap l-split">
          <div className="stack stack--lg">
            <h2 id="attack-h">A swapped payout wallet fails twice</h2>
            <p className="l-sub measure">An emailed copy with a new wallet looks real. Truce stops it in two places.</p>
            <ul className="l-list">
              <li><Icon name="x" /><span><strong>The app shows FAIL.</strong> The wallet is not on the merchant’s domain, so Pay stays off.</span></li>
              <li><Icon name="shield" /><span><strong>The contract reverts.</strong> InvoiceSettler pays only the payout wallet the merchant signed.</span></li>
            </ul>
            {config.demoTools && <div className="btn-row"><Link className="btn btn--secondary" to="/demo">See the swapped-wallet demo</Link></div>}
          </div>
          <Settler />
        </div>
      </section>

      <section className="l-sec" id="pay" aria-labelledby="pay-h">
        <div className="wrap">
          <h2 id="pay-h">Payment that fits B2B terms</h2>
          <p className="l-sub measure">The buyer signs one USDT authorization. A relayer pays the WBT gas.</p>
          <div className="l-cards l-cards--4">
            <article className="card l-card l-card--text"><Icon name="wallet" size={24} /><h3>Pays without gas</h3><p>One signature; the relayer submits it and pays the fee.</p></article>
            <article className="card l-card l-card--text"><Icon name="clock" size={24} /><h3>Collects on the due date</h3><p>Sign now, collected later. A balance check warns before; it is a snapshot, not a lock.</p></article>
            <article className="card l-card l-card--text"><Icon name="key" size={24} /><h3>Warns when wallets change</h3><p>Your browser remembers a merchant’s wallets after you pay.</p></article>
            <article className="card l-card l-card--text"><Icon name="download" size={24} /><h3>Exports a CSV for accounts</h3><p>Every invoice with status, amount and explorer link.</p></article>
          </div>
        </div>
      </section>

      <section className="l-sec l-sec--alt" id="limits" aria-labelledby="limits-h">
        <div className="wrap l-split">
          <div className="stack">
            <h2 id="limits-h">Limits of this testnet build</h2>
            <p className="l-sub measure">What Truce proves, and what it does not.</p>
          </div>
          <ul className="l-rows">
            <li><span>Who signed and where it pays</span><span className="muted">Proved. Not whether goods were delivered.</span></li>
            <li><span>Amounts, payer and payout</span><span className="muted">Public on chain. Line items stay off chain.</span></li>
            <li><span>A signed payment</span><span className="muted">A commitment, not locked funds.</span></li>
            <li><span>A lookalike domain</span><span className="muted">Not stopped before first use; pinning helps after.</span></li>
            <li><span>Network</span><span className="muted">Whitechain Sepolia testnet only, no real users.</span></li>
          </ul>
        </div>
      </section>

      <section className="l-close" aria-labelledby="close-h">
        <div className="wrap stack stack--lg" style={{ alignItems: 'flex-start' }}>
          <h2 id="close-h">Check the next invoice you receive</h2>
          <div className="btn-row">
            <Link className="btn btn--primary btn--lg" to="/verify">Check an invoice<Icon name="arrow" className="arrow" /></Link>
            <Link className="btn btn--secondary btn--lg" to="/setup">Set up your domain</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
