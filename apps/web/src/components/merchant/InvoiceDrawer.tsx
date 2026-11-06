import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { api } from '../../lib/api';
import type { Hex, InvoiceRecord } from '../../lib/api/types';
import { Icon } from '../Icon';
import { InvoiceCard } from '../invoice/InvoiceCard';
import { OnchainStatus } from '../verify/OnchainStatus';
import { RefundPanel } from './RefundPanel';

/** Detail panel for one invoice: status, audit timeline, the invoice itself and its link. */
export function InvoiceDrawer({ hash, onClose }: { hash: Hex; onClose: () => void }) {
  const { toast } = useApp();
  const [rec, setRec] = useState<InvoiceRecord>();
  const [error, setError] = useState<string>();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Reloaded after a refund so the history shows it.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    let live = true;
    api.getInvoice(hash).then((r) => live && setRec(r), (e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [hash, reloadKey]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);

  const link = `${location.origin}/pay/${hash}`;
  return (
    <>
      <div className="drawer-back" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer__head">
          <h2 id="drawer-title" style={{ fontSize: 'var(--t-card)' }}>{rec ? `Invoice for ${rec.doc.details.clientName}` : 'Invoice'}</h2>
          <button ref={closeRef} type="button" className="icon-btn icon-btn--menu" aria-label="Close details" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="drawer__body">
          {error && <p className="field-error" role="alert">{error}</p>}
          {!rec && !error && <div className="skeleton" style={{ height: 360 }} aria-hidden="true" />}
          {rec && (
            <>
              <div className="btn-row">
                <button type="button" className="btn btn--secondary" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast('Link copied'))}><Icon name="copy" size={18} />Copy payment link</button>
                <Link className="btn btn--secondary" to={`/verify?hash=${hash}`}>Open the public record</Link>
              </div>
              <OnchainStatus record={rec} stored />
              {rec.status === 'PAID' && rec.tx && <RefundPanel record={rec} onRefunded={reload} />}
              <InvoiceCard doc={rec.doc} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
