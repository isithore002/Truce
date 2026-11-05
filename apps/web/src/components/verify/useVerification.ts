import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Hex, InvoiceDoc, InvoiceRecord, VerifyResponse } from '../../lib/api/types';
import { errorMessage } from '../../lib/messages';

export type Target = { kind: 'hash'; hash: Hex } | { kind: 'doc'; doc: InvoiceDoc };

export interface VerificationState {
  loading: boolean;
  error?: string;
  errorCode?: string;
  /** the document being checked (from the server, or carried in the link) */
  doc?: InvoiceDoc;
  /** stored record: status, tx, events (hash links only) */
  record?: InvoiceRecord;
  verify?: VerifyResponse;
  retry: () => void;
  /** re-read the stored record (after paying) */
  refresh: () => Promise<InvoiceRecord | undefined>;
}

/**
 * Loads a document and runs the server's checks. A #doc copy goes to POST /api/verify and is never stored.
 * A FAIL result is data, not an error; errors are network or not-found problems and come with a retry.
 */
export function useVerification(target: Target | undefined): VerificationState {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<VerificationState, 'retry' | 'refresh'>>({ loading: !!target });
  const key = target ? (target.kind === 'hash' ? target.hash : JSON.stringify(target.doc)) : '';

  useEffect(() => {
    if (!target) return;
    let live = true;
    const run = async () => {
      setState({ loading: true });
      try {
        if (target.kind === 'hash') {
          const [record, verify] = await Promise.all([api.getInvoice(target.hash), api.verifyHash(target.hash)]);
          if (live) setState({ loading: false, record, doc: record.doc, verify });
        } else {
          const verify = await api.verifyDoc(target.doc);
          if (live) setState({ loading: false, doc: target.doc, verify });
        }
      } catch (e) {
        const code = e instanceof ApiError ? e.code : undefined;
        const msg = code === 'NETWORK' ? (e as Error).message : errorMessage(code, (e as Error).message);
        if (live) setState({ loading: false, error: msg, errorCode: code });
      }
    };
    void run();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  const refresh = useCallback(async () => {
    if (target?.kind !== 'hash') return undefined;
    try {
      const record = await api.getInvoice(target.hash);
      setState((s) => ({ ...s, record, doc: record.doc }));
      return record;
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...state, retry, refresh };
}
