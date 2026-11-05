import { describe, expect, it } from 'vitest';
import { parseConfig } from '../lib/config';

describe('config', () => {
  it('defaults to mock with demo tools on', () => {
    expect(parseConfig({})).toMatchObject({ apiMode: 'mock', demoTools: true, apiBase: 'http://localhost:8787', features: { dueDate: false, soulBadge: false } });
  });
  it('server mode turns demo tools off unless asked', () => {
    expect(parseConfig({ VITE_API_MODE: 'server' }).demoTools).toBe(false);
    expect(parseConfig({ VITE_API_MODE: 'server', VITE_DEMO_TOOLS: '1' }).demoTools).toBe(true);
  });
  it('reads flags and trims the API base', () => {
    const c = parseConfig({ VITE_API_BASE: 'http://x:1/', VITE_FEATURE_DUE_DATE: 'true', VITE_FEATURE_SOUL_BADGE: '1', VITE_EXAMPLE_MODE: 'on' });
    expect(c).toMatchObject({ apiBase: 'http://x:1', exampleMode: true, features: { dueDate: true, soulBadge: true } });
  });
});
