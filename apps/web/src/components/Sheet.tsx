import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Slide-over panel from the right: backdrop, Escape and backdrop click close it, focus returns to where it was. */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [onClose]);

  return (
    <>
      <div className="drawer-back" onClick={onClose} aria-hidden="true" />
      <div className={`drawer sheet${wide ? ' sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="drawer__head">
          <h2 id="sheet-title" style={{ fontSize: 'var(--t-card)' }}>{title}</h2>
          <button ref={closeRef} type="button" className="icon-btn icon-btn--menu" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="drawer__body">{children}</div>
      </div>
    </>
  );
}
