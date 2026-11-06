import { useEffect, useRef, useState, type RefObject } from 'react';

/** True when the user asked the system for less motion. Animations then render their end state. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Reveal on scroll: every element under `root` with [data-reveal] gets the class `is-in` the first time it enters the viewport.
 * [data-reveal-delay="120"] staggers it (ms). Without IntersectionObserver, or with reduced motion, everything is shown at once.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));
    items.forEach((i) => i.style.setProperty('--reveal-delay', `${i.dataset.revealDelay ?? 0}ms`));
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      items.forEach((i) => i.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }),
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [root]);
}

/**
 * Scroll-linked progress of an element through the viewport, written as the CSS variable --p (0 to 1) on that element.
 * 0 = its top is at the bottom of the viewport, 1 = its top has reached `endAt` (fraction of viewport height from the top).
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, endAt = 0.25) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.setProperty('--p', '1');
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, (vh - top) / (vh - vh * endAt)));
      el.style.setProperty('--p', p.toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref, endAt]);
}

/** Page scroll progress (0 to 1) for the bar under the nav. */
export function usePageProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return p;
}

/** Counts from 0 to `to` once the element is visible. Integers only (product facts, not money). */
export function useCountUp(to: number, ms = 1200) {
  const ref = useRef<HTMLElement | null>(null);
  const [n, setN] = useState(() => (prefersReducedMotion() ? to : 0));
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setN(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / ms);
        setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, ms]);
  return { ref, n };
}

/** Eases a displayed number toward `target` whenever it changes (for totals). Returns the current value. */
export function useAnimatedNumber(target: number, ms = 900) {
  const [v, setV] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setV(target); return; }
    const start = performance.now();
    const a = from.current;
    let raf = requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - start) / ms);
      const next = a + (target - a) * (1 - Math.pow(1 - k, 3));
      setV(next);
      from.current = next;
      if (k < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
