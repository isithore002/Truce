import { Link } from 'react-router-dom';
import type { InvoiceRecord } from '../../lib/api/types';
import { explorerTx } from '../../lib/config';
import { formatDay, formatIso } from '../../lib/format';
import { SNAPSHOT_NOTE } from '../../lib/messages';
import { Icon } from '../Icon';
import { AddressChip } from '../invoice/AddressChip';
import { AmountUsdt } from '../invoice/AmountUsdt';

export function Receipt({ record, explorerUrl }: { record: InvoiceRecord; explorerUrl?: string }) {
  const { doc, tx } = record;
  const scheduled = !tx && record.status === 'SCHEDULED_OK';
  return (
    <section className="card receipt stack" aria-labelledby="receipt-title" aria-live="polite">
      <div className="row" style={{ gap: 10 }}>
        <span className="badge badge--ok"><Icon name="check" />{scheduled ? 'Scheduled' : 'Paid'}</span>
        <h3 id="receipt-title">{scheduled ? 'Payment scheduled' : 'Payment receipt'}</h3>
      </div>
      <AmountUsdt value={doc.invoice.amount} size="lg" />
      <dl className="kv">
        <dt>Paid to</dt>
        <dd><AddressChip value={doc.invoice.payout} /></dd>
        <dt>Merchant</dt>
        <dd>{doc.details.merchantName} <span className="mono small muted">{doc.domain}</span></dd>
        {tx && (<><dt>Transaction</dt><dd><AddressChip value={tx.txHash} kind="tx" /></dd></>)}
        {tx?.paidAt && (<><dt>Paid at</dt><dd>{formatIso(tx.paidAt)}</dd></>)}
        {scheduled && (<><dt>Collected on</dt><dd>{formatDay(doc.invoice.dueDate)}</dd></>)}
      </dl>
      {scheduled && <p className="small muted">{SNAPSHOT_NOTE}</p>}
      <div className="btn-row">
        {tx && (
          <a className="btn btn--primary" href={explorerTx(tx.txHash, explorerUrl)} target="_blank" rel="noreferrer">
            See it on the explorer<Icon name="external" size={16} />
          </a>
        )}
        <Link className="btn btn--secondary" to={`/verify?hash=${record.hash}`}>Open the public record</Link>
      </div>
    </section>
  );
}
