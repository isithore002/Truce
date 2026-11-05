import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../lib/api';
import type { Address } from '../../lib/api/types';
import { downloadBlob } from '../../lib/merchantSetup';
import { Icon } from '../Icon';

export function CsvButton({ address, disabled }: { address: Address; disabled?: boolean }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--secondary"
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        try {
          downloadBlob(await api.exportCsv(address), `truce-invoices-${address.slice(2, 8).toLowerCase()}.csv`);
          toast('CSV downloaded');
        } catch (e) {
          toast(`CSV failed: ${(e as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="download" size={18} />
      {busy ? 'Preparing CSV…' : 'Download CSV'}
    </button>
  );
}
