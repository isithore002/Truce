/**
 * "Bill in a series": the merchant asks for N invoices one month apart. Each one is a separate invoice, signed by the
 * merchant and paid (or scheduled) by the buyer on its own. Nothing recurs by itself and nothing is charged
 * automatically; the series is only a faster way to create the invoices.
 */

/** Most invoices one series may create (each needs its own wallet signature). */
export const MAX_SERIES = 12;

/** The "number of invoices" field: a whole number from 1 to 12, else null. */
export function parseSeriesCount(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= MAX_SERIES ? n : null;
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * Due dates (unix seconds as strings) for a monthly series: the first date, then the same day of each following month.
 * A day that does not exist in a shorter month falls on that month's last day (31 Jan, 28 Feb, 31 Mar). The time of
 * day is kept, so a midnight-UTC date stays at midnight UTC.
 */
export function monthlyDueDates(firstDue: string | number, count: number): string[] {
  const first = Number(firstDue);
  const d = new Date(first * 1000);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const timeOfDay = first - Date.UTC(year, month, day) / 1000;
  return Array.from({ length: Math.max(0, count) }, (_, k) => {
    const y = year + Math.floor((month + k) / 12);
    const m = (month + k) % 12;
    return String(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))) / 1000 + timeOfDay);
  });
}

/** The note printed on invoice `index` (0-based) of `total`; a single invoice keeps the merchant's note unchanged. */
export function seriesNote(notes: string, index: number, total: number): string {
  if (total <= 1) return notes;
  const tag = `Invoice ${index + 1} of ${total}`;
  return notes ? `${notes} · ${tag}` : tag;
}
