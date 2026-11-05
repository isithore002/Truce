import { describe, expect, it } from 'vitest';
import { comparePin, forgetPin, getPin, PIN_KEY, savePin, type KeyValueStore } from '../lib/pins';

const store = (): KeyValueStore => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const S1 = '0x1111111111111111111111111111111111111111';
const S2 = '0x2222222222222222222222222222222222222222';
const P1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const P2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('key pinning', () => {
  it('is NEW before any payment', () => {
    expect(comparePin('acme.example', { signingAddress: S1, payout: P1 }, store()).state).toBe('NEW');
  });
  it('MATCHes after a payment, case-insensitively and with a normalised domain', () => {
    const s = store();
    savePin('ACME.example', { signingAddress: S1, payoutAddresses: [P1] }, s);
    expect(comparePin('https://acme.example/', { signingAddress: S1, payout: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }, s).state).toBe('MATCH');
  });
  it('reports a CHANGED payout with the old and new values', () => {
    const s = store();
    savePin('acme.example', { signingAddress: S1, payoutAddresses: [P1] }, s);
    const r = comparePin('acme.example', { signingAddress: S1, payout: P2 }, s);
    expect(r.state).toBe('CHANGED');
    if (r.state !== 'CHANGED') return;
    expect(r.payoutChanged).toBe(true);
    expect(r.signingChanged).toBe(false);
    expect(r.pin.payoutAddresses).toEqual([P1]);
    expect(r.current.payout).toBe(P2);
  });
  it('reports a CHANGED signer', () => {
    const s = store();
    savePin('acme.example', { signingAddress: S1, payoutAddresses: [P1] }, s);
    const r = comparePin('acme.example', { signingAddress: S2, payout: P1 }, s);
    expect(r.state === 'CHANGED' && r.signingChanged && !r.payoutChanged).toBe(true);
  });
  it('adds payouts under the same signer and replaces them under a new signer', () => {
    const s = store();
    savePin('acme.example', { signingAddress: S1, payoutAddresses: [P1] }, s);
    savePin('acme.example', { signingAddress: S1, payoutAddresses: [P2] }, s);
    expect(getPin('acme.example', s)?.payoutAddresses).toEqual([P1, P2]);
    savePin('acme.example', { signingAddress: S2, payoutAddresses: [P2] }, s);
    expect(getPin('acme.example', s)).toMatchObject({ signingAddress: S2, payoutAddresses: [P2] });
  });
  it('survives corrupt storage and can forget a pin', () => {
    const s = store();
    s.setItem(PIN_KEY, '{not json');
    expect(comparePin('acme.example', { signingAddress: S1, payout: P1 }, s).state).toBe('NEW');
    savePin('acme.example', { signingAddress: S1, payoutAddresses: [P1] }, s);
    forgetPin('acme.example', s);
    expect(getPin('acme.example', s)).toBeUndefined();
  });
});
