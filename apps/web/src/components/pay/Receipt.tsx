import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import type { InvoiceRecord } from '../../lib/api/types';
import { config, explorerTx } from '../../lib/config';
import { formatDue, formatIso } from '../../lib/format';
import { SNAPSHOT_NOTE } from '../../lib/messages';
import { Icon } from '../Icon';
import { AddressChip } from '../invoice/AddressChip';
import { AmountUsdt } from '../invoice/AmountUsdt';
import { NetworkFee } from './NetworkFee';

export function Receipt({ record, explorerUrl }: { record: InvoiceRecord; explorerUrl?: string }) {
  const { doc, tx } = record;
  const { chainSimulated: mock } = useApp(); // simulated payments carry made-up hashes, so they must not link to the explorer
  const scheduled = !tx && record.status === 'SCHEDULED_OK';
  return (
    <section className="card receipt stack" aria-labelledby="receipt-title" aria-live="polite">
      <div className="receipt__burst" aria-hidden="true">
        <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" /><path d="M20 33l8 8 16-17" /></svg>
        {Array.from({ length: 10 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 36}deg` }} />)}
      </div>
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
        {tx && (<><dt>Transaction</dt><dd><AddressChip value={tx.txHash} kind="tx" explorer={!mock} /></dd></>)}
        {tx && !mock && <NetworkFee key={tx.txHash} txHash={tx.txHash} payer={tx.payer} explorerUrl={explorerUrl} />}
        {tx?.paidAt && (<><dt>Paid at</dt><dd>{formatIso(tx.paidAt)}</dd></>)}
        {scheduled && (<><dt>Collected on</dt><dd>{formatDue(doc.invoice.dueDate)}</dd></>)}
      </dl>
      {scheduled && <p className="small muted">{SNAPSHOT_NOTE}</p>}
      {tx && mock && (
        <p className="small muted" data-testid="mock-tx-note">
          {config.apiMode === 'mock'
            ? 'Example transaction: this app is running in demo mode, with no server and no chain, so this payment and its transaction hash are made up and cannot be found on the explorer.'
            : 'Simulated payment: the server is running a mock chain (CHAIN_MODE=mock), so no USDT moved and this transaction hash cannot be found on the explorer. Start the server with CHAIN_MODE=testnet to pay on Whitechain Sepolia.'}
        </p>
      )}
      <div className="btn-row">
        {tx && !mock && (
          <a className="btn btn--primary" href={explorerTx(tx.txHash, explorerUrl)} target="_blank" rel="noreferrer">
            See it on the explorer<Icon name="external" size={16} />
          </a>
        )}
        <Link className="btn btn--secondary" to={`/verify?hash=${record.hash}`}>Open the public record</Link>
      </div>
    </section>
  );
}
