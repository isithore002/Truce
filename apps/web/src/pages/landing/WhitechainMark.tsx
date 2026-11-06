import { useRef, type PointerEvent } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

/*
  Whitechain's own mark (public/brand/whitechain-mark.svg, the unmodified icon.svg from whitechain.io), shown in 3D:
  the same image stacked in thin layers gives it depth, it turns slowly, and it tilts toward the pointer.
  Used only to credit the network Truce runs on.
*/

const LAYERS = 18;

/** The turning 3D mark in the hero. */
export function Mark3D({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 30}deg`);
    el.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -24}deg`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--ry', '0deg');
    ref.current?.style.setProperty('--rx', '0deg');
  };

  return (
    <div className={`wc__stage ${className}`} ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} role="img" aria-label="Whitechain logo">
      <svg className="wc__orbit" viewBox="0 0 400 400" aria-hidden="true">
        <ellipse cx="200" cy="200" rx="180" ry="60" />
        <ellipse cx="200" cy="200" rx="150" ry="150" />
      </svg>
      <div className="wc__glow" aria-hidden="true" />
      <div className="wc__tilt">
        <div className="wc__spin">
          {Array.from({ length: LAYERS }, (_, i) => (
            <img
              key={i}
              src="/brand/whitechain-mark.svg"
              alt=""
              draggable={false}
              className={i === 0 ? 'wc__face' : i === LAYERS - 1 ? 'wc__back' : 'wc__layer'}
              style={{ transform: `translateZ(${-i * 1.6}px)${i === LAYERS - 1 ? ' rotateY(180deg)' : ''}`, ['--d' as string]: i / LAYERS }}
            />
          ))}
        </div>
      </div>
      <span className="wc__chip wc__chip--a">USDT · EIP-3009</span>
      <span className="wc__chip wc__chip--b">WBT gas</span>
      <span className="wc__chip wc__chip--c">chain 1874</span>
      <div className="wc__shadow" aria-hidden="true" />
    </div>
  );
}

