import { describe, expect, it } from 'vitest';
import { formatDay, formatDue } from '../lib/format';
import { MAX_SERIES, monthlyDueDates, parseSeriesCount, seriesNote } from '../lib/series';

const utc = (y: number, m: number, d: number, h = 0, min = 0) => String(Date.UTC(y, m - 1, d, h, min) / 1000);

describe('parseSeriesCount', () => {
  it('accepts whole numbers from 1 to the maximum', () => {
    expect(parseSeriesCount('1')).toBe(1);
    expect(parseSeriesCount(' 3 ')).toBe(3);
    expect(parseSeriesCount(String(MAX_SERIES))).toBe(MAX_SERIES);
  });
  it('rejects zero, too many, decimals and text', () => {
    for (const bad of ['', '0', '13', '99', '-1', '1.5', 'abc', '2x', '100']) expect(parseSeriesCount(bad)).toBeNull();
  });
});

describe('monthlyDueDates', () => {
  it('keeps the same day in each following month', () => {
    expect(monthlyDueDates(utc(2026, 12, 15), 3)).toEqual([utc(2026, 12, 15), utc(2027, 1, 15), utc(2027, 2, 15)]);
  });
  it('crosses a year end', () => {
    expect(monthlyDueDates(utc(2026, 11, 1), 4)).toEqual([utc(2026, 11, 1), utc(2026, 12, 1), utc(2027, 1, 1), utc(2027, 2, 1)]);
  });
  it('uses the last day of a shorter month and goes back to the original day afterwards', () => {
    expect(monthlyDueDates(utc(2027, 1, 31), 4)).toEqual([utc(2027, 1, 31), utc(2027, 2, 28), utc(2027, 3, 31), utc(2027, 4, 30)]);
  });
  it('handles a leap year February', () => {
    expect(monthlyDueDates(utc(2028, 1, 31), 2)[1]).toBe(utc(2028, 2, 29));
  });
  it('keeps the time of day', () => {
    const out = monthlyDueDates(utc(2026, 11, 6, 9, 30), 2);
    expect(out).toEqual([utc(2026, 11, 6, 9, 30), utc(2026, 12, 6, 9, 30)]);
    expect(formatDue(out[1])).toBe('6 Dec 2026, 09:30 UTC');
  });
  it('returns midnight dates that read as plain days, and a single date for a count of 1', () => {
    const out = monthlyDueDates(utc(2026, 12, 15), 2);
    expect(out.map(formatDay)).toEqual(['15 Dec 2026', '15 Jan 2027']);
    expect(monthlyDueDates(utc(2026, 12, 15), 1)).toHaveLength(1);
    expect(monthlyDueDates(utc(2026, 12, 15), 0)).toEqual([]);
  });
});

describe('seriesNote', () => {
  it('leaves a single invoice alone and numbers the others', () => {
    expect(seriesNote('Net 30', 0, 1)).toBe('Net 30');
    expect(seriesNote('Net 30', 0, 3)).toBe('Net 30 · Invoice 1 of 3');
    expect(seriesNote('Net 30', 2, 3)).toBe('Net 30 · Invoice 3 of 3');
    expect(seriesNote('', 1, 3)).toBe('Invoice 2 of 3');
  });
});
