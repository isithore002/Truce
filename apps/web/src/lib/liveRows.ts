import type { Hex, InvoiceSummary } from './api/types';

/** How often the merchant dashboard asks the server for changes (only while the tab is visible). */
export const POLL_MS = 4000;

/** Hashes whose status changed, or that appeared, between two polls. The very first load flashes nothing. */
export function changedRows(prev: InvoiceSummary[] | undefined, next: InvoiceSummary[]): Hex[] {
  if (!prev) return [];
  const before = new Map(prev.map((r) => [r.hash, r.status]));
  return next.filter((r) => before.get(r.hash) !== r.status).map((r) => r.hash);
}

/** True when a poll brought nothing new, so the page can keep its old array and skip a re-render. */
export function sameRows(a: InvoiceSummary[] | undefined, b: InvoiceSummary[]): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}
