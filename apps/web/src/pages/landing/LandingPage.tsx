import '../../styles/landing.css';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { config } from '../../lib/config';
import { FAQ, Faq } from './Faq';
import { DashboardFrame, PhoneMock } from './Mockups';

/*
  Layout follows the "teal treasury" reference template the user chose: hero, product UI in a device frame, stat row,
  sticky feature panel, interactive card, dark band, FAQ, wordmark. Copy, numbers and screens are Truce's own:
  the stat row states product facts (not traction), and every mock screen is labelled EXAMPLE DATA.
*/

const STEPS = [
  {
    n: '01',
    title: 'Publish your wallets',
    body: 'Put one small file at /.well-known/truce.json on your own domain: the wallet that signs your invoices and the wallets that may be paid. Anyone can read it, and only you can change it.',
    chip: 'northlight-design.example',
    tone: 'file' as const,
  },
  {
    n: '02',
    title: 'The buyer checks, then signs once',
    body: 'The pay page runs ten checks against that file before the Pay button wakes up. On PASS the buyer signs one USDT authorization. The relayer pays the gas, so the buyer needs no WBT.',
    chip: 'PASS · 10 of 10 checks',
    tone: 'pay' as const,
  },
  {
    n: '03',
    title: 'Settled on chain, on the record',
    body: 'InvoiceSettler checks the merchant signature again on chain, pays only the payout wallet the merchant signed, and settles each invoice once. The receipt links to the explorer.',
    chip: 'Paid · tx on explorer',
    tone: 'paid' as const,
  },
];

function useActiveStep(count: number) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: '-45% 0px -45% 0px' },
    );
    refs.current.slice(0, count).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [count]);
  return { refs, active };
}

const CHECKS = [
  ['Invoice document is well formed', false],
  ['Merchant signature matches', true],
  ['Domain file found at northlight-design.example', false],
  ['Signing wallet is the one the domain publishes', false],
  ['Payout wallet is listed by the domain', true],
  ['Invoice is bound to this domain', false],
  ['Accepted token on chain 1874', false],
  ['Not expired', false],
  ['Line items are exactly what was signed', false],
  ['Payer is allowed', false],
] as const;

function AttackCard() {
  const [swapped, setSwapped] = useState(false);
  const failed = swapped ? CHECKS.filter(([, hit]) => hit).length : 0;
  return (
    <div className="l-attack card">
      <div className="l-attack__left">
        <span className="l-eyebrow-plain">Try it: one invoice, ten checks</span>
        <div className={`l-attack__verdict ${swapped ? 'is-fail' : 'is-pass'}`} aria-live="polite">
          <Icon name={swapped ? 'x' : 'check'} size={28} />
          <span>{swapped ? 'FAIL' : 'PASS'}</span>
        </div>
        <label className="l-switch">
          <input type="checkbox" checked={swapped} onChange={(e) => setSwapped(e.target.checked)} />
          <span className="l-switch__track" aria-hidden="true"><span /></span>
          Swap the payout wallet after the merchant signed
        </label>
        <div className="l-attack__tiles">
          <div><span>Payout wallet</span><strong className="mono">{swapped ? '0xbadc…9d37' : '0x3b9c…9b0c'}</strong></div>
          <div><span>Checks passed</span><strong>{10 - failed} / 10</strong></div>
          <div><span>Pay button</span><strong>{swapped ? 'Disabled' : 'Enabled'}</strong></div>
        </div>
        <p className="small muted">{swapped ? 'The contract would also revert: it only pays the wallet inside the signature.' : '1,250 USDT, example invoice from Northlight Design Studio to Beta Labs.'}</p>
      </div>
      <ul className="l-attack__checks" aria-label="Check results">
        {CHECKS.map(([label, hit]) => {
          const bad = swapped && hit;
          return (
            <li key={label} className={bad ? 'is-bad' : undefined}>
              <span className="l-dot" aria-hidden="true">{bad ? <Icon name="x" size={12} /> : <Icon name="check" size={12} />}</span>
              {label}
              <span className="sr-only">{bad ? ' failed' : ' passed'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Dial() {
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <svg className="l-dial" viewBox="0 0 240 240" aria-hidden="true">
      {ticks.map((i) => {
        const a = (i / 60) * Math.PI * 2;
        const r1 = i % 5 === 0 ? 100 : 106;
        return <line key={i} x1={120 + Math.cos(a) * r1} y1={120 + Math.sin(a) * r1} x2={120 + Math.cos(a) * 114} y2={120 + Math.sin(a) * 114} />;
      })}
      <circle cx="120" cy="120" r="84" className="l-dial__ring" />
      <circle cx="120" cy="120" r="58" className="l-dial__core" />
      <path d="M120 92l22 9v15c0 14-9 23-22 28-13-5-22-14-22-28v-15z" className="l-dial__shield" />
      <path d="M110 120l7 7 14-15" className="l-dial__tick" />
      <circle cx="58" cy="168" r="5" className="l-dial__gold" />
      <circle cx="176" cy="52" r="3.5" className="l-dial__ink" />
    </svg>
  );
}

export function LandingPage() {
  const { refs, active } = useActiveStep(STEPS.length);
  const tryLink = config.demoTools ? '/demo' : '/verify';

  return (
    <div className="landing">
      <section className="l-hero">
        <div className="wrap">
          <span className="l-eyebrow"><i aria-hidden="true" />Testnet · Whitechain Sepolia · USDT</span>
          <h1>Invoices your buyer can check before they pay.</h1>
          <p className="lead muted measure">
            Every invoice is bound to the merchant's own domain. The buyer sees PASS or FAIL, signs once, and the contract
            pays only the wallet the merchant published.
          </p>
          <div className="btn-row">
            <Link className="btn btn--primary btn--lg" to="/setup">Create an invoice<Icon name="arrow" className="arrow" /></Link>
            <Link className="btn btn--secondary btn--lg" to="/verify">Check an invoice</Link>
          </div>
        </div>
        <div className="wrap l-hero__frame">
          <DashboardFrame />
        </div>
      </section>

      <section className="l-stats" aria-label="What every payment goes through">
        <div className="wrap">
          <p className="l-stats__lead">One file on your domain. One signature from the buyer. One settlement per invoice.</p>
          <dl className="l-stats__row">
            <div><dt>Checks before the Pay button wakes up</dt><dd>10</dd></div>
            <div><dt>Signature from the buyer, no gas needed</dt><dd>1</dd></div>
            <div><dt>Times an invoice can be paid</dt><dd>1×</dd></div>
          </dl>
        </div>
      </section>

      <section className="l-features">
        <div className="wrap">
          <span className="l-eyebrow"><i aria-hidden="true" />How it works</span>
          <div className="l-features__grid">
            <div className="l-features__media" aria-hidden="true">
              <div className="l-glow" />
              <PhoneMock step={STEPS[active].tone} />
              <span className="l-chip l-chip--a"><Icon name="check" size={12} />{STEPS[active].chip}</span>
              <span className="l-chip l-chip--b">Due · net 30</span>
              <span className="l-features__count">{STEPS[active].n} / 03</span>
            </div>
            <div className="l-features__steps">
              {STEPS.map((s, i) => (
                <article key={s.n} ref={(el) => { refs.current[i] = el; }} data-i={i} className={`l-step${i === active ? ' is-on' : ''}`}>
                  <span className="l-step__n">{s.n}</span>
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="l-try">
        <div className="wrap">
          <ul className="l-try__facts">
            <li><strong>Domain-bound</strong><span>Checked against truce.json</span></li>
            <li><strong>Signed payout</strong><span>Enforced on chain</span></li>
            <li><strong>Key pinning</strong><span>Warns when wallets change</span></li>
            <li><strong>Gasless for buyers</strong><span>Relayer pays in WBT</span></li>
          </ul>
          <AttackCard />
        </div>
      </section>

      <section className="l-band">
        <div className="wrap"><div className="l-band__inner">
          <div className="stack">
            <span className="l-eyebrow l-eyebrow--inv"><i aria-hidden="true" />The attack we stop</span>
            <h2>A swapped payout wallet fails twice: in the app and on chain.</h2>
            <p className="measure">
              Invoice fraud usually means a real invoice with someone else's bank details. Truce puts the payout wallet inside the
              merchant's signature and lists it on the merchant's domain, so a swapped wallet shows FAIL and the contract refuses it.
            </p>
            <Link className="l-band__link" to={tryLink}>Run the swapped-payout demo<Icon name="arrow" size={16} /></Link>
          </div>
          <Dial />
        </div>
        </div>
      </section>

      <section className="l-faq">
        <div className="wrap l-faq__grid">
          <span className="l-eyebrow"><i aria-hidden="true" />FAQ</span>
          <div>
            <h2>Everything you need to know</h2>
            <Faq items={FAQ} />
          </div>
        </div>
      </section>

      <section className="l-cta">
        <div className="wrap">
          <h2><span>Send an invoice</span> your client can check before paying you in USDT.</h2>
          <div className="btn-row">
            <Link className="btn btn--primary btn--lg" to="/setup">Set up your domain<Icon name="arrow" className="arrow" /></Link>
            <Link className="btn btn--secondary btn--lg" to="/merchant">Open the dashboard</Link>
          </div>
        </div>
      </section>

      <div className="l-wordmark" aria-hidden="true">Truce</div>
    </div>
  );
}
