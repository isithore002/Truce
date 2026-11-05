import { describe, expect, it } from 'vitest';
import {
  dateInputToUnix, formatDateUtc, formatDay, formatUsdt, formatWbt, isAddress, isHash, lineTotal, parseQuantity, parseUsdt,
  relativeTime, sameAddress, shortAddress, sumLineItems, unixToDateInput,
} from '../lib/format';

describe('formatUsdt', () => {
  it('formats whole amounts without decimals', () => {
    expect(formatUsdt('1250000000')).toBe('1,250');
    expect(formatUsdt(0n)).toBe('0');
    expect(formatUsdt('1234567890000000')).toBe('1,234,567,890');
  });
  it('keeps at least two decimals when there is a fraction', () => {
    expect(formatUsdt('1250500000')).toBe('1,250.50');
    expect(formatUsdt('1')).toBe('0.000001');
    expect(formatUsdt('1250123400')).toBe('1,250.1234');
  });
  it('fixed mode always shows two decimals', () => {
    expect(formatUsdt('1250000000', { fixed: true })).toBe('1,250.00');
  });
  it('handles negatives and rejects non-integers', () => {
    expect(formatUsdt(-1500000n)).toBe('-1.50');
    expect(() => formatUsdt('1.5')).toThrow();
    expect(() => formatUsdt(1.5)).toThrow();
  });
});

describe('parseUsdt', () => {
  it('parses to base units with no float error', () => {
    expect(parseUsdt('1250')).toEqual({ ok: true, value: 1250000000n });
    expect(parseUsdt('1,250.5')).toEqual({ ok: true, value: 1250500000n });
    expect(parseUsdt('0.1')).toEqual({ ok: true, value: 100000n });
    expect(parseUsdt('.000001')).toEqual({ ok: true, value: 1n });
    expect(parseUsdt('999999999999.999999')).toEqual({ ok: true, value: 999999999999999999n });
  });
  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '-1', '1.2.3', '1e6', '0.0000001']) expect(parseUsdt(bad).ok).toBe(false);
  });
  it('round-trips with formatUsdt', () => {
    for (const s of ['1', '1,250', '0.05', '12.345678']) {
      const r = parseUsdt(s);
      expect(r.ok && parseUsdt(formatUsdt(r.value))).toEqual(r);
    }
  });
});

describe('line items', () => {
  it('multiplies whole quantities exactly', () => {
    expect(lineTotal('3', '333333')).toBe(999999n);
    expect(sumLineItems([{ quantity: '1', unitPrice: '1250000000' }, { quantity: '2', unitPrice: '500000' }])).toBe(1251000000n);
  });
  it('quantity must be a whole number from 1', () => {
    expect(parseQuantity('2')).toEqual({ ok: true, value: 2n });
    expect(parseQuantity('0').ok).toBe(false);
    expect(parseQuantity('1.5').ok).toBe(false);
  });
});

describe('dates', () => {
  it('formats UTC', () => {
    expect(formatDateUtc('1767225600')).toBe('1 Jan 2026, 00:00 UTC');
    expect(formatDay('1767225600')).toBe('1 Jan 2026');
  });
  it('converts date inputs as UTC midnight', () => {
    expect(dateInputToUnix('2026-01-01')).toBe('1767225600');
    expect(dateInputToUnix('nope')).toBeNull();
    expect(unixToDateInput('1767225600')).toBe('2026-01-01');
  });
  it('relative time', () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now / 1000 + 3 * 86400, now)).toBe('in 3 days');
    expect(relativeTime(now / 1000 - 7200, now)).toBe('2 hours ago');
    expect(relativeTime(now / 1000 + 10, now)).toBe('in under a minute');
  });
});

describe('addresses', () => {
  const a = '0x7a1E3c9B42d5F0e8A6b1C4d7E2f9a3B6c8D0e1F2';
  it('shortens', () => expect(shortAddress(a)).toBe('0x7a1E…e1F2'));
  it('compares case-insensitively', () => expect(sameAddress(a, a.toLowerCase())).toBe(true));
  it('validates', () => {
    expect(isAddress(a)).toBe(true);
    expect(isAddress('0x123')).toBe(false);
    expect(isHash(`0x${'a'.repeat(64)}`)).toBe(true);
  });
  it('formats WBT', () => expect(formatWbt('1840000000000000000')).toBe('1.8400 WBT'));
});
