import type { Hex, InvoiceDoc } from './api/types';
import { isHash } from './format';

/** Payment link helpers: `/pay/<hash>` (stored invoice) and `/pay#doc=<base64url JSON>` (a copy carried in the link). */

export function encodeDoc(doc: InvoiceDoc): string {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDoc(b64url: string): InvoiceDoc | null {
  try {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as InvoiceDoc) : null;
  } catch {
    return null;
  }
}

export const docLinkPath = (doc: InvoiceDoc) => `/pay#doc=${encodeDoc(doc)}`;
export const hashLinkPath = (hash: string) => `/pay/${hash}`;

export type VerifyTarget = { kind: 'hash'; hash: Hex } | { kind: 'doc'; doc: InvoiceDoc } | { kind: 'invalid'; reason: string };

/** Accepts a raw hash, a /pay/<hash> link, a ?hash= link or a #doc= link. */
export function parseVerifyInput(raw: string): VerifyTarget {
  const s = raw.trim();
  if (!s) return { kind: 'invalid', reason: 'Paste a payment link or an invoice hash.' };
  if (isHash(s)) return { kind: 'hash', hash: s };
  const docMatch = s.match(/[#&?]doc=([A-Za-z0-9_-]+)/);
  if (docMatch) {
    const doc = decodeDoc(docMatch[1]!);
    return doc ? { kind: 'doc', doc } : { kind: 'invalid', reason: 'The invoice inside this link is damaged.' };
  }
  const hashMatch = s.match(/(?:\/pay\/|[?&]hash=)(0x[0-9a-fA-F]{64})\b/);
  if (hashMatch) return { kind: 'hash', hash: hashMatch[1] as Hex };
  return { kind: 'invalid', reason: 'That is not a Truce payment link or invoice hash.' };
}
