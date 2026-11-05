import { useApp } from '../../app/AppContext';
import { explorerAddress, explorerTx } from '../../lib/config';
import { shortAddress } from '../../lib/format';
import { Icon } from '../Icon';

/** Shortened address or hash with copy and explorer buttons. The full value is in the title and the screen-reader label. */
export function AddressChip({ value, kind = 'address', label, explorer = true }: { value: string; kind?: 'address' | 'tx' | 'hash'; label?: string; explorer?: boolean }) {
  const { toast, publicConfig } = useApp();
  const base = publicConfig?.explorerUrl;
  const href = kind === 'address' ? explorerAddress(value, base) : kind === 'tx' ? explorerTx(value, base) : undefined;
  const what = kind === 'address' ? 'address' : kind === 'tx' ? 'transaction' : 'hash';
  return (
    <span className="addr">
      {label && <span className="addr__label small muted">{label}</span>}
      <code title={value}>
        <span aria-hidden="true">{shortAddress(value, kind === 'address' ? 6 : 8, kind === 'address' ? 4 : 6)}</span>
        <span className="sr-only">{value}</span>
      </code>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Copy ${what} ${value}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => toast('Copied'), () => toast('Copy failed: select the text instead'));
        }}
      >
        <Icon name="copy" />
      </button>
      {explorer && href && (
        <a className="icon-btn" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${what} in the Whitechain explorer (new tab)`}>
          <Icon name="external" />
        </a>
      )}
    </span>
  );
}
