import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../lib/api';
import type { Address } from '../../lib/api/types';
import { downloadBlob } from '../../lib/merchantSetup';
import { Icon } from '../Icon';

type Kind = 'invoices' | 'ledger';
const LABELS: Record<Kind, { idle: string; busy: string; done: string; file: string }> = {
  invoices: { idle: 'Download CSV', busy: 'Preparing CSV…', done: 'CSV downloaded', file: 'truce-invoices' },
  ledger: { idle: 'Download ledger', busy: 'Preparing ledger…', done: 'Ledger downloaded', file: 'truce-ledger' },
};

/** One download button for the accountant files: the invoice list (one row per invoice) or the ledger (one row per money movement). */
export function CsvButton({ address, disabled, kind = 'invoices' }: { address: Address; disabled?: boolean; kind?: Kind }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const label = LABELS[kind];
  return (
    <button
      type="button"
      className="btn btn--secondary"
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await (kind === 'ledger' ? api.exportLedger(address) : api.exportCsv(address));
          downloadBlob(blob, `${label.file}-${address.slice(2, 8).toLowerCase()}.csv`);
          toast(label.done);
        } catch (e) {
          toast(`Download failed: ${(e as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="download" size={18} />
      {busy ? label.busy : label.idle}
    </button>
  );
}
