import '../../styles/landing.css';
import '../../styles/landing-anim.css';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { config } from '../../lib/config';
import { useCountUp, useReveal, useScrollProgress } from '../../lib/motion';
import { FAQ, Faq } from './Faq';
import { LiveCheck, PaymentFlow } from './Animated';
import { DashboardFrame, PhoneMock } from './Mockups';
import { TamperLab } from './TamperLab';

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
          <span key={String(swapped)}>{swapped ? 'FAIL' : 'PASS'}</span>
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
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);
  useScrollProgress(frameRef, 0.35);

  return (
    <div className="landing" ref={rootRef}>
      <section className="l-hero">
        <div className="l-hero__glow" aria-hidden="true" />
        <div className="wrap">
          <span className="l-eyebrow" data-reveal><i aria-hidden="true" />Testnet · Whitechain Sepolia · USDT</span>
          <h1 className="l-words" aria-label="Invoices your buyer can check before they pay.">
            {'Invoices your buyer can check before they pay.'.split(' ').map((w, i) => (
              <span key={i} aria-hidden="true" data-reveal data-reveal-delay={80 + i * 60}>{w}</span>
            ))}
          </h1>
          <p className="lead muted measure" data-reveal data-reveal-delay="520">
            Every invoice is bound to the merchant's own domain. The buyer sees PASS or FAIL, signs once, and the contract
            pays only the wallet the merchant published.
          </p>
          <div className="btn-row" data-reveal data-reveal-delay="640">
            <Link className="btn btn--primary btn--lg" to="/setup">Create an invoice<Icon name="arrow" className="arrow" /></Link>
            <Link className="btn btn--secondary btn--lg" to="/verify">Check an invoice</Link>
          </div>
        </div>
        <div className="wrap l-hero__frame" ref={frameRef}>
          <div className="l-tilt" data-reveal data-reveal-delay="300">
            <DashboardFrame />
          </div>
        </div>
      </section>

      <section className="l-stats" aria-label="What every payment goes through">
        <div className="wrap">
          <p className="l-stats__lead" data-reveal>One file on your domain. One signature from the buyer. One settlement per invoice.</p>
          <dl className="l-stats__row">
            <Stat to={10} label="Checks before the Pay button wakes up" delay={0} />
            <Stat to={1} label="Signature from the buyer, no gas needed" delay={120} />
            <Stat to={1} suffix="×" label="Times an invoice can be paid" delay={240} />
          </dl>
        </div>
      </section>

      <section className="l-live" aria-labelledby="live-h">
        <div className="wrap">
          <div className="l-sec-head" data-reveal>
            <span className="l-eyebrow"><i aria-hidden="true" />Live check</span>
            <h2 id="live-h">Watch one invoice pass, then fail when the payout wallet is swapped.</h2>
            <p>The same ten checks run on every pay page. Change one wallet after the merchant signed, and the Pay button never wakes up.</p>
          </div>
          <div data-reveal data-reveal-delay="120"><LiveCheck /></div>
        </div>
      </section>

      <section className="l-lab" aria-labelledby="lab-h">
        <div className="wrap">
          <div className="l-sec-head" data-reveal>
            <span className="l-eyebrow"><i aria-hidden="true" />Tamper lab</span>
            <h2 id="lab-h">Now try to break it yourself.</h2>
            <p>A real invoice, signed in your browser with a throwaway key. Change the amount, swap the payout wallet or sign as an attacker, and watch the same checks the pay page runs.</p>
          </div>
          <div data-reveal data-reveal-delay="120"><TamperLab /></div>
        </div>
      </section>

      <section className="l-features">
        <div className="wrap">
          <span className="l-eyebrow" data-reveal><i aria-hidden="true" />How it works</span>
          <div className="l-features__grid">
            <div className="l-features__media" aria-hidden="true" data-reveal>
              <div className="l-glow" />
              <div key={active} className="l-phone-swap"><PhoneMock step={STEPS[active].tone} /></div>
              <span key={`c${active}`} className="l-chip l-chip--a"><Icon name="check" size={12} />{STEPS[active].chip}</span>
              <span className="l-chip l-chip--b">Due · net 30</span>
              <span className="l-features__count">{STEPS[active].n} / 03</span>
              <span className="l-features__bar"><i style={{ width: `${((active + 1) / STEPS.length) * 100}%` }} /></span>
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

      <section className="l-flow" aria-labelledby="flow-h">
        <div className="wrap">
          <div className="l-sec-head" data-reveal>
            <span className="l-eyebrow l-eyebrow--inv"><i aria-hidden="true" />Where a payment travels</span>
            <h2 id="flow-h">From the merchant's signature to the payout wallet, checked twice.</h2>
            <p>Once in the buyer's browser against the merchant's own domain, and again on chain by InvoiceSettler.</p>
          </div>
          <div data-reveal data-reveal-delay="120"><PaymentFlow /></div>
        </div>
      </section>

      <section className="l-try">
        <div className="wrap">
          <ul className="l-try__facts">
            {[['Domain-bound', 'Checked against truce.json'], ['Signed payout', 'Enforced on chain'], ['Key pinning', 'Warns when wallets change'], ['Gasless for buyers', 'Relayer pays in WBT']].map(([t, d], i) => (
              <li key={t} data-reveal data-reveal-delay={i * 90}><strong>{t}</strong><span>{d}</span></li>
            ))}
          </ul>
          <div data-reveal data-reveal-delay="120"><AttackCard /></div>
        </div>
      </section>

      <section className="l-band">
        <div className="wrap"><div className="l-band__inner" data-reveal>
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
          <span className="l-eyebrow" data-reveal><i aria-hidden="true" />FAQ</span>
          <div>
            <h2 data-reveal>Everything you need to know</h2>
            <div data-reveal data-reveal-delay="120"><Faq items={FAQ} /></div>
          </div>
        </div>
      </section>

      <section className="l-cta">
        <div className="wrap">
          <h2 data-reveal><span>Send an invoice</span> your client can check before paying you in USDT.</h2>
          <div className="btn-row" data-reveal data-reveal-delay="120">
            <Link className="btn btn--primary btn--lg" to="/setup">Set up your domain<Icon name="arrow" className="arrow" /></Link>
            <Link className="btn btn--secondary btn--lg" to="/merchant">Open the dashboard</Link>
          </div>
        </div>
      </section>

      <div className="l-wordmark" aria-hidden="true" data-reveal>Truce</div>
    </div>
  );
}

function Stat({ to, suffix = '', label, delay }: { to: number; suffix?: string; label: string; delay: number }) {
  const { ref, n } = useCountUp(to, 1100);
  return (
    <div data-reveal data-reveal-delay={delay}>
      <dt>{label}</dt>
      <dd ref={ref as React.RefObject<HTMLElement & HTMLDListElement>} aria-label={`${to}${suffix}`}><span aria-hidden="true">{n}{suffix}</span></dd>
    </div>
  );
}
