import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MockModeBanner } from '../components/layout/MockModeBanner';

describe('MockModeBanner', () => {
  it('says plainly in mock mode that nothing is on the blockchain', () => {
    const html = renderToStaticMarkup(<MockModeBanner mode="mock" />);
    expect(html).toContain('mock-mode-banner');
    expect(html).toContain('nothing here is on the blockchain');
    expect(html).toContain('VITE_API_MODE=server');
  });
  it('shows nothing in server mode', () => {
    expect(renderToStaticMarkup(<MockModeBanner mode="server" />)).toBe('');
  });
});
