import { describe, expect, it } from 'vitest';
import { CHECK_IDS, type CheckId } from '../lib/api/types';
import { merchantHints } from '../lib/merchantHints';

/** All ten checks passing, except the ones named. */
const checks = (...failing: CheckId[]) => CHECK_IDS.map((id) => ({ id, ok: !failing.includes(id) }));
const D = 'acme.com';

describe('merchantHints', () => {
  it('has nothing to say when every check passes', () => {
    expect(merchantHints(checks(), D)).toEqual([]);
  });

  it('an unreadable domain file is the only hint, however many dependent checks also failed', () => {
    const h = merchantHints(checks('domain_file_reachable', 'merchant_matches_domain_file', 'payout_in_domain_file'), D);
    expect(h).toHaveLength(1);
    expect(h[0]).toContain('https://acme.com/.well-known/truce.json');
    expect(h[0]).toContain('Setup, step 3');
  });

  it('names the wallet problem when the file is readable but disagrees', () => {
    const signer = merchantHints(checks('merchant_matches_domain_file'), D);
    expect(signer).toHaveLength(1);
    expect(signer[0]).toContain('different signing wallet');

    const payout = merchantHints(checks('payout_in_domain_file'), D);
    expect(payout).toHaveLength(1);
    expect(payout[0]).toContain('payout wallet is not listed');
  });

  it('gives each failing cause its own hint, signature first', () => {
    const h = merchantHints(checks('signature_valid', 'payout_in_domain_file', 'not_expired'), D);
    expect(h).toHaveLength(3);
    expect(h[0]).toContain('signature does not match');
    expect(h[1]).toContain('payout wallet');
    expect(h[2]).toContain('expired');
  });

  it('covers the chain and token check', () => {
    expect(merchantHints(checks('chain_and_token_allowed'), D)[0]).toContain('chain 1874');
  });

  it('falls back to a generic pointer for checks it has no specific advice for', () => {
    for (const id of ['document_valid', 'domain_hash_matches', 'memo_hash_matches_details', 'payer_ok'] as const) {
      expect(merchantHints(checks(id), D)).toEqual(['See the failing checks above for what to change.']);
    }
  });

  it('always puts the domain in the advice, so it can be copied', () => {
    expect(merchantHints(checks('payout_in_domain_file'), 'northlight-design.example')[0]).toContain('northlight-design.example');
  });
});
