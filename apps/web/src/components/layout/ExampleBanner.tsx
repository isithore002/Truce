import { useApp } from '../../app/AppContext';
import { Icon } from '../Icon';

/** Required by CLAUDE.md rule 4: example data is always labelled. */
export function ExampleBanner() {
  const { showExample } = useApp();
  if (!showExample) return null;
  return (
    <div className="example-band" role="note" aria-label="Example data notice">
      <div className="wrap">
        <Icon name="info" size={16} />
        <span>
          <strong>EXAMPLE DATA.</strong> The merchants and clients shown here are fictional. Testnet only.
        </span>
      </div>
    </div>
  );
}
