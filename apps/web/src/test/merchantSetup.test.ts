import { describe, expect, it } from 'vitest';
import { suggestDemoDomain } from '../lib/merchantSetup';
import { validateDomain } from '../lib/merchantSetup';

describe('suggestDemoDomain', () => {
  it('turns a business name into a fictional .example name', () => {
    expect(suggestDemoDomain('My Studio')).toBe('my-studio.example');
    expect(suggestDemoDomain("  Acme & Sons, Ltd.!  ")).toBe('acme-sons-ltd.example');
  });
  it('falls back to a plain name when the business name has nothing usable', () => {
    expect(suggestDemoDomain('')).toBe('my-studio.example');
    expect(suggestDemoDomain('***')).toBe('my-studio.example');
  });
  it('never ends a label with a hyphen, even when cut at the length limit', () => {
    const name = suggestDemoDomain(`${'a'.repeat(39)} bbbbbb`);
    expect(name).not.toMatch(/-\.example$/);
    expect(name.length).toBeLessThanOrEqual(40 + '.example'.length);
  });
  it('always passes the setup form domain validation', () => {
    for (const n of ['My Studio', 'x', 'Northlight Design Studio', '日本語', 'A--B']) expect(validateDomain(suggestDemoDomain(n))).toBeUndefined();
  });
});
