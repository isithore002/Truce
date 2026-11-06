import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { prefersReducedMotion } from '../../lib/motion';

/* Animated explainers for the landing page. All data is the fictional EXAMPLE DATA invoice. */

/** Runs a tick counter only while `ref` is on screen, not paused, and motion is allowed. */
function useTicker(ms: number, paused: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || paused || prefersReducedMotion()) return;
    const t = window.setInterval(() => setTick((v) => v + 1), ms);
    return () => window.clearInterval(t);
  }, [visible, paused, ms]);
  return { ref, tick };
}

function PauseButton({ paused, onToggle, what }: { paused: boolean; onToggle: () => void; what: string }) {
  return (
    <button type="button" className="anim-pause" aria-pressed={paused} aria-label={paused ? `Play the ${what}` : `Pause the ${what}`} onClick={onToggle}>
      {paused ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5l8 5-8 5z" fill="currentColor" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 5h3v10H6zM11 5h3v10h-3z" fill="currentColor" /></svg>}
    </button>
  );
}

/* ---------------- live check: honest invoice passes, swapped payout fails ---------------- */

const CHECKS = [
  'Document well formed', 'Merchant signature matches', 'truce.json found on the domain', 'Signing wallet listed', 'Payout wallet listed',
  'Bound to this domain', 'Accepted token, chain 1874', 'Not expired', 'Line items unchanged', 'Payer allowed',
];
const FAILS_ON_SWAP = new Set([1, 4]);
const HONEST = '0x3b9c4d2e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c';
const ATTACK = '0xbadc0de5a1e4f00d9c2e7b3a8d1f6c4e0b5a9d37';
const PRE = 3;
const SCRAMBLE = 6;
const HOLD = 9;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function scrambled(from: string, to: string, p: number) {
  const hex = '0123456789abcdef';
  return to.split('').map((c, i) => (i < 2 ? c : i / to.length < p ? c : Math.random() < 0.5 ? from[i] : hex[Math.floor(Math.random() * 16)])).join('');
}

export function LiveCheck() {
  const [paused, setPaused] = useState(false);
  const { ref, tick } = useTicker(320, paused);
  const reduced = prefersReducedMotion();
  const honestLen = PRE + 10 + HOLD;
  const attackLen = PRE + SCRAMBLE + 10 + HOLD;
  const t = tick % (honestLen + attackLen);
  const attack = t >= honestLen;
  const local = attack ? t - honestLen : t;
  const scr = attack ? SCRAMBLE : 0;
  const shown = reduced ? 10 : Math.max(0, Math.min(10, local - PRE - scr));
  const done = shown >= 10;
  const scrambling = attack && local >= PRE && local < PRE + SCRAMBLE;
  const payout = !attack ? HONEST : scrambling ? scrambled(HONEST, ATTACK, (local - PRE) / SCRAMBLE) : ATTACK;
  const verdict = done ? (attack ? 'FAIL' : 'PASS') : 'CHECKING';

  return (
    <div className={`live ${attack ? 'is-attack' : 'is-honest'}${done ? ' is-done' : ''}`} ref={ref}>
      <div className="live__head">
        <span className="live__tag">{attack ? 'Same invoice, payout wallet swapped' : 'Honest invoice'}</span>
        <PauseButton paused={paused} onToggle={() => setPaused((p) => !p)} what="live check" />
      </div>
      <div className="live__grid">
        <div className="live__invoice">
          <span className="live__label">Invoice INV-0042 · EXAMPLE DATA</span>
          <strong className="live__amount">1,250 <small>USDT</small></strong>
          <dl>
            <div><dt>From</dt><dd>Northlight Design Studio</dd></div>
            <div><dt>Domain</dt><dd className="mono">northlight-design.example</dd></div>
            <div className={attack ? 'is-bad' : undefined}>
              <dt>Pays to</dt>
              <dd className={`mono live__payout${scrambling ? ' is-scrambling' : ''}`}>{scrambling ? payout.slice(0, 18) + '…' : short(payout)}</dd>
            </div>
          </dl>
          <div className={`live__stamp live__stamp--${verdict.toLowerCase()}`} aria-live="polite">
            {verdict === 'CHECKING' ? <span className="live__spinner" aria-hidden="true" /> : <Icon name={verdict === 'PASS' ? 'check' : 'x'} size={22} />}
            <span>{verdict === 'CHECKING' ? `Checking ${shown}/10` : verdict}</span>
          </div>
          <div className={`live__chain${done ? ' is-on' : ''}`}>
            <Icon name={attack ? 'x' : 'shield'} size={16} />
            {attack ? 'On chain: InvoiceSettler reverts, nothing is paid' : 'On chain: InvoiceSettler pays 0x3b9c…9b0c'}
          </div>
        </div>
        <ol className="live__checks" aria-label="Checks">
          {CHECKS.map((c, i) => {
            const state = i >= shown ? 'wait' : attack && FAILS_ON_SWAP.has(i) ? 'bad' : 'ok';
            return (
              <li key={c} data-state={state}>
                <span className="live__dot" aria-hidden="true">{state === 'ok' ? <Icon name="check" size={12} /> : state === 'bad' ? <Icon name="x" size={12} /> : null}</span>
                {c}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ---------------- payment flow: where a payment travels ---------------- */

const FLOW = [
  { icon: 'file' as const, title: 'Merchant signs', text: 'The merchant wallet signs the invoice: amount, payout wallet, due date and domain.' },
  { icon: 'shield' as const, title: 'Buyer checks', text: 'The pay page fetches truce.json from the merchant domain and runs ten checks.' },
  { icon: 'key' as const, title: 'Buyer signs once', text: 'On PASS the buyer signs one USDT authorization. No gas, no approval.' },
  { icon: 'refresh' as const, title: 'Relayer submits', text: 'A relayer sends the transaction and pays the gas in WBT.' },
  { icon: 'wallet' as const, title: 'Payout wallet paid', text: 'InvoiceSettler checks the signature again and pays only the signed payout wallet, once.' },
];

export function PaymentFlow() {
  const [paused, setPaused] = useState(false);
  const { ref, tick } = useTicker(1700, paused);
  const active = tick % FLOW.length;
  return (
    <div className="flow" ref={ref} style={{ ['--active' as string]: active, ['--n' as string]: FLOW.length }}>
      <div className="flow__domain" data-on={active === 1}>
        <Icon name="globe" size={16} /><span className="mono">northlight-design.example/.well-known/truce.json</span>
      </div>
      <div className="flow__track">
        <span className="flow__rail" aria-hidden="true"><i /></span>
        <span className="flow__packet" aria-hidden="true"><span>1,250 USDT</span></span>
        <ol className="flow__nodes">
          {FLOW.map((f, i) => (
            <li key={f.title} data-state={i < active ? 'done' : i === active ? 'on' : 'todo'}>
              <span className="flow__icon"><Icon name={f.icon} size={20} /></span>
              <strong>{f.title}</strong>
            </li>
          ))}
        </ol>
      </div>
      <div className="flow__foot">
        <p key={active} className="flow__caption" aria-live="polite"><span>{String(active + 1).padStart(2, '0')}</span>{FLOW[active].text}</p>
        <PauseButton paused={paused} onToggle={() => setPaused((p) => !p)} what="payment flow" />
      </div>
    </div>
  );
}
