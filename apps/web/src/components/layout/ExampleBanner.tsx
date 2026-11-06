import { useLocation } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { Icon } from '../Icon';

/**
 * Required by CLAUDE.md rule 4: example data is always labelled.
 * App pages: a slim strip fixed to the bottom of the screen. Landing page: an ordinary line at the very end of the
 * page, so it does not sit over the hero and the story.
 */
export function ExampleBanner() {
  const { showExample } = useApp();
  const { pathname } = useLocation();
  if (!showExample) return null;
  return (
    <div className={`example-band${pathname === '/' ? ' example-band--end' : ''}`} role="note" aria-label="Example data notice">
      <div className="wrap">
        <Icon name="info" size={16} />
        <span>
          <strong>EXAMPLE DATA.</strong> The merchants and clients shown here are fictional. Testnet only.
        </span>
      </div>
    </div>
  );
}
