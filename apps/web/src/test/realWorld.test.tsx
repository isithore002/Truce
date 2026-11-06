import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RealWorld } from '../pages/landing/RealWorld';
import { REAL_WORLD, REAL_WORLD_CHECKED_ON, REAL_WORLD_SCOPE } from '../lib/realWorld';

const html = renderToStaticMarkup(<RealWorld />);

describe('real-world reports on the landing page', () => {
  it('has three sourced reports with unique ids', () => {
    expect(REAL_WORLD).toHaveLength(3);
    expect(new Set(REAL_WORLD.map((r) => r.id)).size).toBe(3);
  });

  it('links every report to its original over https, in a new tab that cannot reach back', () => {
    for (const r of REAL_WORLD) {
      expect(new URL(r.url).protocol).toBe('https:');
      expect(html).toContain(`href="${r.url}"`);
    }
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors).toHaveLength(REAL_WORLD.length);
    for (const a of anchors) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
  });

  it('points at the original publishers, not at a summary site', () => {
    const hosts = REAL_WORLD.map((r) => new URL(r.url).hostname);
    expect(hosts).toEqual(['www.ic3.gov', 'truist.com', 'cointelegraph.com']);
  });

  it('shows each figure, who published it, and a limit of that source', () => {
    for (const r of REAL_WORLD) {
      expect(html).toContain(r.figure);
      expect(html).toContain(r.sourceName.replace(/"/g, '&quot;'));
      expect(r.caveat.length).toBeGreaterThan(20);
    }
  });

  it('says the figures are the publishers’ own, when they were read, and what Truce does not do', () => {
    expect(html).toContain('verified them independently');
    expect(html).toContain(REAL_WORLD_CHECKED_ON);
    expect(html).toContain(REAL_WORLD_SCOPE.doesNot.slice(0, 40));
  });

  it('does not over-claim (CLAUDE.md rule 5)', () => {
    const text = html.replace(/<[^>]*>/g, ' ').toLowerCase();
    for (const banned of ['guarantee', 'the only', 'first-ever', 'eliminate', 'prevents all', 'stops all', 'verified business']) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it('keeps the figures the sources actually print', () => {
    const fbi = REAL_WORLD.find((r) => r.id === 'fbi-ic3-2025')!;
    expect(fbi.figure).toBe('$3.05 billion');
    expect(fbi.body).toContain('24,768');
    expect(fbi.body).toContain('$2.77 billion');
    const afp = REAL_WORLD.find((r) => r.id === 'afp-2025')!;
    expect(afp.figure).toBe('79%');
    expect(afp.body).toContain('63%');
    expect(afp.body).toContain('22%');
    const usdt = REAL_WORLD.find((r) => r.id === 'usdt-address-poisoning-2025')!;
    expect(usdt.figure).toBe('49,999,950 USDT');
  });
});
