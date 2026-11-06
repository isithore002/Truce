import { describe, expect, it } from 'vitest';
import type { Hex, InvoiceSummary, Status } from '../lib/api/types';
import { changedRows, sameRows } from '../lib/liveRows';

const row = (n: number, status: Status): InvoiceSummary =>
  ({ hash: `0x${String(n).padStart(64, '0')}` as Hex, invoiceId: `0x${n}` as Hex, clientName: 'Beta Labs', amount: '10000', dueDate: '1767225600', status, example: true }) as InvoiceSummary;

describe('changedRows', () => {
  it('flashes nothing on the first load', () => {
    expect(changedRows(undefined, [row(1, 'ISSUED')])).toEqual([]);
  });
  it('reports a status change', () => {
    const prev = [row(1, 'ISSUED'), row(2, 'SCHEDULED_OK')];
    const next = [row(1, 'PAID'), row(2, 'SCHEDULED_OK')];
    expect(changedRows(prev, next)).toEqual([row(1, 'PAID').hash]);
  });
  it('reports a new invoice and ignores unchanged ones', () => {
    const prev = [row(1, 'PAID')];
    const next = [row(2, 'ISSUED'), row(1, 'PAID')];
    expect(changedRows(prev, next)).toEqual([row(2, 'ISSUED').hash]);
  });
  it('reports nothing when the poll is identical', () => {
    const list = [row(1, 'PAID'), row(2, 'ISSUED')];
    expect(changedRows(list, [...list])).toEqual([]);
  });
});

describe('sameRows', () => {
  it('is false before anything was loaded', () => {
    expect(sameRows(undefined, [row(1, 'PAID')])).toBe(false);
  });
  it('is true for equal content and false when anything differs', () => {
    expect(sameRows([row(1, 'PAID')], [row(1, 'PAID')])).toBe(true);
    expect(sameRows([row(1, 'PAID')], [row(1, 'FAILED')])).toBe(false);
    expect(sameRows([row(1, 'PAID')], [row(1, 'PAID'), row(2, 'ISSUED')])).toBe(false);
  });
});
