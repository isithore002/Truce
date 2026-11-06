import { describe, expect, it, vi } from 'vitest';
import { formatWbtFine } from '../lib/format';
import { feePayer, fetchTxCost, parseExplorerTx } from '../lib/relayerFee';

const RELAYER = '0x37Defa03df5e954F22ECCd2E5dF7095bD4a395Ff';
const BUYER = '0xB17a0EE1E924daf6D968d344f129DF517F18a28E';
// Shape and values taken from a real settlement on Whitechain Sepolia (explorer API v2).
const sample = { from: { hash: RELAYER }, fee: { type: 'actual', value: '1053840726012520' }, gas_used: '210726', l1_fee: '12520' };

describe('parseExplorerTx', () => {
  it('reads the sender and total fee', () => {
    expect(parseExplorerTx(sample)).toEqual({ from: RELAYER, feeWei: 1053840726012520n });
  });
  it('rejects anything that is not a finished transaction', () => {
    expect(parseExplorerTx(undefined)).toBeUndefined();
    expect(parseExplorerTx('x')).toBeUndefined();
    expect(parseExplorerTx({})).toBeUndefined();
    expect(parseExplorerTx({ ...sample, fee: { type: 'maximum', value: '1' } })).toBeUndefined();
    expect(parseExplorerTx({ ...sample, fee: { type: 'actual', value: '1.5' } })).toBeUndefined();
    expect(parseExplorerTx({ ...sample, from: { hash: 'nope' } })).toBeUndefined();
  });
});

describe('feePayer', () => {
  const cost = { from: RELAYER, feeWei: 1n };
  it('is the relayer when somebody else sent the transaction', () => {
    expect(feePayer(cost, BUYER)).toBe('relayer');
    expect(feePayer(cost, undefined)).toBe('relayer');
  });
  it('is the buyer when the buyer sent it, whatever the address case', () => {
    expect(feePayer({ from: BUYER.toLowerCase(), feeWei: 1n }, BUYER)).toBe('buyer');
  });
});

describe('formatWbtFine', () => {
  it('shows a settlement fee that 4 places would round away', () => {
    expect(formatWbtFine('1053840726012520')).toBe('0.001053 WBT');
    expect(formatWbtFine(10n ** 18n)).toBe('1.000000 WBT');
    expect(formatWbtFine(0n)).toBe('0.000000 WBT');
  });
});

describe('fetchTxCost', () => {
  it('returns the parsed cost and calls the explorer API for this hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => sample });
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchTxCost('https://explorer.example/', '0xabc');
    expect(out?.feeWei).toBe(1053840726012520n);
    expect(fetchMock.mock.calls[0][0]).toBe('https://explorer.example/api/v2/transactions/0xabc');
    vi.unstubAllGlobals();
  });
  it('gives undefined, never throws, on a 404, bad JSON or a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await fetchTxCost('https://e', '0x1')).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad'); } }));
    expect(await fetchTxCost('https://e', '0x1')).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchTxCost('https://e', '0x1')).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
