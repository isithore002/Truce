import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../lib/api/fixtures';
import { decodeDoc, encodeDoc, parseVerifyInput } from '../lib/doclink';

const doc = buildFixtures(1_800_000_000)[0]!.doc;

describe('doc links', () => {
  it('round-trips a document through base64url, including non-ASCII text', () => {
    const d = { ...doc, details: { ...doc.details, notes: 'Zahlung – netto 30 ✓' } };
    const enc = encodeDoc(d);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDoc(enc)).toEqual(d);
  });
  it('parses every link form', () => {
    const h = `0x${'ab'.repeat(32)}`;
    expect(parseVerifyInput(h)).toEqual({ kind: 'hash', hash: h });
    expect(parseVerifyInput(`https://truce.example/pay/${h}`)).toEqual({ kind: 'hash', hash: h });
    expect(parseVerifyInput(`https://truce.example/verify?hash=${h}`)).toEqual({ kind: 'hash', hash: h });
    expect(parseVerifyInput(`https://truce.example/pay#doc=${encodeDoc(doc)}`)).toEqual({ kind: 'doc', doc });
  });
  it('rejects junk with a reason', () => {
    expect(parseVerifyInput('').kind).toBe('invalid');
    expect(parseVerifyInput('hello').kind).toBe('invalid');
    expect(parseVerifyInput('/pay#doc=AAAA').kind).toBe('invalid');
  });
});
