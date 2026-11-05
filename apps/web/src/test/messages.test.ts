import { describe, expect, it } from 'vitest';
import { CHECK_IDS, ERROR_CODES, HEALTH_REASONS, OVERLAYS, STATUSES } from '../lib/api/types';
import { checkMessage, CHECK_MESSAGES, ERROR_MESSAGES, errorMessage, HEALTH_MESSAGES, OVERLAY_BADGES, STATUS_BADGES } from '../lib/messages';

const JARGON = /_|\bnonce\b|\bhash\b|\bEIP\b|\bmemo\b/i;

describe('messages', () => {
  it('has a plain pass and fail message for every check id', () => {
    expect(Object.keys(CHECK_MESSAGES).sort()).toEqual([...CHECK_IDS].sort());
    for (const id of CHECK_IDS) {
      for (const ok of [true, false]) {
        const m = checkMessage(id, ok, { domain: 'acme.example' });
        expect(m.title.length).toBeGreaterThan(5);
        expect(m.text.length).toBeGreaterThan(10);
        expect(m.title + m.text.replace('.well-known', '')).not.toMatch(JARGON);
      }
    }
  });
  it('names the domain where the domain matters', () => {
    expect(checkMessage('payout_in_domain_file', false, { domain: 'acme.example' }).text).toBe('The payout wallet is not listed on acme.example. Do not pay this invoice.');
  });
  it('has a badge for every status and overlay', () => {
    for (const s of STATUSES) expect(STATUS_BADGES[s].label).toBeTruthy();
    for (const o of OVERLAYS) expect(OVERLAY_BADGES[o].label).toBeTruthy();
  });
  it('has a message for every health reason and error code', () => {
    for (const r of HEALTH_REASONS) expect(HEALTH_MESSAGES[r]).toBeTruthy();
    for (const c of ERROR_CODES) {
      expect(ERROR_MESSAGES[c]).toBeTruthy();
      expect(ERROR_MESSAGES[c]).not.toMatch(JARGON);
    }
  });
  it('falls back for unknown codes', () => {
    expect(errorMessage('WHAT', 'server said so')).toBe('server said so');
    expect(errorMessage(undefined)).toBe(ERROR_MESSAGES.INTERNAL);
  });
  it('never makes the claims the project avoids', () => {
    const all = JSON.stringify([STATUS_BADGES, HEALTH_MESSAGES, ERROR_MESSAGES, CHECK_IDS.map((id) => [checkMessage(id, true, { domain: 'x' }), checkMessage(id, false, { domain: 'x' })])]);
    expect(all).not.toMatch(/guaranteed|verified business|fraud-proof|needs Whitechain/i);
  });
});
