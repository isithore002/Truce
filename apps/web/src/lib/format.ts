/** Formatting helpers. Amounts are bigint base units end to end: never a float. */

export const USDT_DECIMALS = 6;
const UNIT = 10n ** BigInt(USDT_DECIMALS);

function toBig(v: bigint | string | number): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new Error('Amount must be an integer number of base units');
    return BigInt(v);
  }
  if (!/^-?\d+$/.test(v.trim())) throw new Error(`Not a base-unit integer: ${v}`);
  return BigInt(v.trim());
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * 1250000000 -> "1,250"; 1250500000 -> "1,250.50"; 1 -> "0.000001".
 * Whole amounts drop the decimals; otherwise at least two decimals, trailing zeros trimmed past that.
 */
export function formatUsdt(base: bigint | string | number, opts: { fixed?: boolean } = {}): string {
  const n = toBig(base);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(USDT_DECIMALS, '0');
  let fracOut = frac.replace(/0+$/, '');
  if (opts.fixed) fracOut = frac.slice(0, 2).padEnd(2, '0') + frac.slice(2).replace(/0+$/, '');
  else if (fracOut.length > 0 && fracOut.length < 2) fracOut = fracOut.padEnd(2, '0');
  return `${neg ? '-' : ''}${group(whole.toString())}${fracOut ? '.' + fracOut : ''}`;
}

export const formatUsdtWithUnit = (base: bigint | string | number) => `${formatUsdt(base)} USDT`;

export type ParseResult = { ok: true; value: bigint } | { ok: false; error: string };

/** "1,250.5" -> 1250500000n. Rejects negatives, more than 6 decimals and anything that is not a plain number. */
export function parseUsdt(input: string): ParseResult {
  const s = input.trim().replace(/,/g, '');
  if (s === '') return { ok: false, error: 'Enter an amount' };
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return { ok: false, error: 'Use digits and one decimal point, for example 1250.50' };
  const [w = '0', f = ''] = s.split('.');
  if (f.length > USDT_DECIMALS) return { ok: false, error: 'USDT has at most 6 decimal places' };
  const value = BigInt(w || '0') * UNIT + BigInt((f || '').padEnd(USDT_DECIMALS, '0') || '0');
  return { ok: true, value };
}

/** Whole-number quantity only, so line totals stay exact base units. */
export function parseQuantity(input: string): ParseResult {
  const s = input.trim();
  if (!/^\d+$/.test(s) || BigInt(s) === 0n) return { ok: false, error: 'Quantity is a whole number from 1' };
  return { ok: true, value: BigInt(s) };
}

export function lineTotal(quantity: string, unitPrice: string): bigint {
  return toBig(quantity) * toBig(unitPrice);
}

export function sumLineItems(items: { quantity: string; unitPrice: string }[]): bigint {
  return items.reduce((acc, it) => acc + lineTotal(it.quantity, it.unitPrice), 0n);
}

/* ---------- dates (unix seconds as strings) ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function toDate(sec: string | number | bigint): Date {
  return new Date(Number(sec) * 1000);
}

/** "1 Jan 2027, 00:00 UTC" */
export function formatDateUtc(sec: string | number | bigint): string {
  const d = toDate(sec);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "1 Jan 2027" in UTC: the calendar date written on the invoice */
export function formatDay(sec: string | number | bigint): string {
  const d = toDate(sec);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Local time with the zone name, for "your time" lines */
export function formatDateLocal(sec: string | number | bigint, locale?: string): string {
  return toDate(sec).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' });
}

export function formatIso(iso: string): string {
  return formatDateUtc(Math.floor(new Date(iso).getTime() / 1000));
}

/** "in 3 days", "2 hours ago": coarse, for due and expiry hints */
export function relativeTime(sec: string | number | bigint, nowMs = Date.now()): string {
  const diff = Number(sec) * 1000 - nowMs;
  const abs = Math.abs(diff);
  const units: [number, string][] = [[86_400_000, 'day'], [3_600_000, 'hour'], [60_000, 'minute']];
  for (const [ms, name] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      const label = `${n} ${name}${n === 1 ? '' : 's'}`;
      return diff >= 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return diff >= 0 ? 'in under a minute' : 'just now';
}

/** "YYYY-MM-DD" (a date input, read as UTC midnight) -> unix seconds string */
export function dateInputToUnix(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : String(Math.floor(ms / 1000));
}

export function unixToDateInput(sec: string | number): string {
  const d = toDate(sec);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/* ---------- addresses and hashes ---------- */

/** 0x1234567890abcdef... -> 0x1234…cdef */
export function shortAddress(addr: string, lead = 6, tail = 4): string {
  if (!addr) return '';
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

export const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export const isAddress = (v: string): v is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(v);
export const isHash = (v: string): v is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(v);

/** WBT has 18 decimals; shown to 4 places for the ops panel */
export function formatWbt(wei: string | bigint): string {
  const n = toBig(wei);
  const unit = 10n ** 18n;
  const whole = n / unit;
  const frac = ((n % unit) * 10_000n) / unit;
  return `${group(whole.toString())}.${frac.toString().padStart(4, '0')} WBT`;
}
