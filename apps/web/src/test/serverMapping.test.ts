import { invoiceHash as libInvoiceHash, memoHash as libMemoHash, receiveAuthorizationTypedData } from '@truce/invoice-lib';
import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../lib/api/fixtures';
import { fromServer } from '../lib/api/client';
import { invoiceLib, toLibInvoice } from '../lib/invoiceLib';

const doc = buildFixtures()[0].doc;
const ctx = { chainId: 1874, settler: '0xB1e1c081D5FB009D8f908b220D902E9F98dfbFE7' as const };

describe('invoiceLib seam delegates to @truce/invoice-lib', () => {
  it('hashes exactly like the library', () => {
    expect(invoiceLib.invoiceHash(doc.invoice, ctx)).toBe(libInvoiceHash(toLibInvoice(doc.invoice), { chainId: 1874, verifyingContract: ctx.settler }));
    expect(invoiceLib.memoHash(doc.details)).toBe(libMemoHash(doc.details));
  });
  it('builds ReceiveWithAuthorization with nonce = invoice hash, to = settler, window from the library', () => {
    const hash = invoiceLib.invoiceHash(doc.invoice, ctx);
    const out = invoiceLib.receiveWithAuthorizationTypedData({ invoice: doc.invoice, invoiceHash: hash, from: doc.invoice.merchant, settler: ctx.settler, mode: 'now', chainId: 1874 });
    const ref = receiveAuthorizationTypedData({ from: doc.invoice.merchant, settler: ctx.settler, invoice: toLibInvoice(doc.invoice), invoiceHash: hash, mode: 'now' }, { chainId: 1874, token: doc.invoice.token });
    expect(out.typed.message).toEqual(ref.message);
    expect(out.validAfter).toBe('0');
    expect(out.validBefore).toBe(doc.invoice.expiry);
  });
  it('makes 32-byte invoice ids with 16 random bytes', () => {
    expect(invoiceLib.newInvoiceId()).toMatch(/^0x0{32}[0-9a-f]{32}$/);
  });
});

describe('server response mapping', () => {
  it('normalises /api/config', () => {
    const c = fromServer.config({ chainId: 1874, settler: ctx.settler, tokens: [doc.invoice.token], explorerBase: 'https://explorer.testnet.whitechain.io', exampleMode: true });
    expect(c).toMatchObject({ token: doc.invoice.token, tokenDecimals: 6, explorerUrl: 'https://explorer.testnet.whitechain.io', exampleMode: true });
  });
  it('maps payment, health, schedule and unix times on an invoice', () => {
    const r = fromServer.invoice('0xab', {
      doc, status: 'PAID', events: [{ at: 1_700_000_000, type: 'paid', txHash: '0x01' }],
      payment: { payer: doc.invoice.merchant, paidAt: 1_700_000_000, txHash: '0x01' },
      health: { reason: 'LOW_BALANCE', checkedAt: 1_700_000_000 }, schedule: { validAfter: '1', validBefore: '2' },
    });
    expect(r.tx).toEqual({ txHash: '0x01', payer: doc.invoice.merchant, paidAt: '2023-11-14T22:13:20.000Z' });
    expect(r.health).toMatchObject({ ok: false, reason: 'LOW_BALANCE' });
    expect(r.events?.[0].at).toBe('2023-11-14T22:13:20.000Z');
    expect(r.mode).toBe('due');
  });
  it('maps /healthz', () => {
    expect(fromServer.healthz({ ok: true, mode: 'mock', rpc: { chainId: 1874, blockNumber: '42' }, relayer: { address: ctx.settler, wbtBalance: '5' } }))
      .toEqual({ ok: true, chainMode: 'mock', block: '42', relayerBalanceWei: '5' });
  });
});
