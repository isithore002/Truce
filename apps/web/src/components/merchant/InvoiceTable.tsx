import type { Hex, InvoiceSummary } from '../../lib/api/types';
import { formatDue } from '../../lib/format';
import { HEALTH_MESSAGES } from '../../lib/messages';
import { AddressChip } from '../invoice/AddressChip';
import { AmountUsdt } from '../invoice/AmountUsdt';
import { StatusBadge } from '../invoice/StatusBadge';

export function InvoiceTable({ rows, selected, onOpen, flash }: { rows: InvoiceSummary[]; selected?: Hex; onOpen: (hash: Hex) => void; flash?: ReadonlySet<Hex> }) {
  return (
    <div className="card card--flush">
      <table className="table">
        <caption className="sr-only">Your invoices. Select a client name to see details.</caption>
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.hash} className={flash?.has(r.hash) ? 'row-flash' : undefined} aria-selected={selected === r.hash} onClick={() => onOpen(r.hash)} style={{ ['--i' as string]: i }}>
              <td data-label="Client">
                <button type="button" className="rowlink" onClick={(e) => { e.stopPropagation(); onOpen(r.hash); }}>{r.clientName}</button>
              </td>
              <td data-label="Amount" className="num"><AmountUsdt value={r.amount} size="sm" /></td>
              <td data-label="Due" style={{ whiteSpace: 'nowrap' }}>{formatDue(r.dueDate)}</td>
              <td data-label="Status">
                <span className="stack stack--sm" style={{ gap: 2 }}>
                  <StatusBadge status={r.status} overlay={r.overlay} />
                  {(r.status === 'AT_RISK' || r.status === 'FAILED') && r.healthReason && <span className="small muted">{HEALTH_MESSAGES[r.healthReason]}</span>}
                </span>
              </td>
              <td data-label="Transaction" onClick={(e) => e.stopPropagation()}>
                {r.txHash ? <AddressChip value={r.txHash} kind="tx" /> : <span className="muted small">None yet</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
