/**
 * Opt-in smoke test: the web app's own HTTP client, response mapping and typed-data seam against a RUNNING apps/server.
 * Skipped unless SMOKE_API is set, so `npm test` stays offline.
 *
 *   DEMO_DOMAINS=1 PORT=8790 npm run server            (terminal 1, mock chain; keys are only needed for the signers below)
 *   npm run smoke:web                                  (terminal 2, from the repo root)
 *
 * Signs as the Northlight example merchant (MERCHANT_PK) and as the buyer (PAYER_PK), both throwaway keys from .env.
 * This is what the pages do minus the browser wallet: the same invoiceLib calls build the typed data, the same httpApi sends it.
 */
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { ApiError, httpApi } from '../lib/api/client';
import { invoiceLib } from '../lib/invoiceLib';
import { merchantHints } from '../lib/merchantHints';
import { monthlyDueDates, seriesNote } from '../lib/series';
import { ZERO_ADDRESS, type Address, type Invoice, type InvoiceDetails, type InvoiceDoc } from '../lib/api/types';

const run = !!process.env.SMOKE_API;
const DOMAIN = 'northlight-design.example';
const DAY = 86400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function account(name: 'MERCHANT_PK' | 'PAYER_PK') {
  const k = process.env[name];
  if (!k || !/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error(`${name} is missing (run with node --env-file=.env)`);
  return privateKeyToAccount(k as Hex);
}

describe.skipIf(!run)('web client against apps/server', () => {
  const merchant = run ? account('MERCHANT_PK') : undefined!;
  const buyer = run ? account('PAYER_PK') : undefined!;

  async function makeDoc(dueInSeconds: number, label: string, payout?: Address, over: { dueAt?: number; notes?: string } = {}) {
    const cfg = await httpApi.getConfig();
    const details: InvoiceDetails = {
      merchantName: 'Northlight Design Studio', clientName: 'Beta Labs',
      lineItems: [{ description: `${label} (EXAMPLE DATA)`, quantity: '1', unitPrice: '10000' }],
      notes: over.notes ?? 'EXAMPLE DATA. Smoke test.', example: true,
    };
    const due = over.dueAt ?? Math.floor(Date.now() / 1000) + dueInSeconds;
    const invoice: Invoice = {
      invoiceId: invoiceLib.newInvoiceId(), merchant: merchant.address, payout: payout ?? (await payoutFromDomain()), token: cfg.token,
      amount: '10000', dueDate: String(due), expiry: String(due + DAY), payer: ZERO_ADDRESS,
      domainHash: invoiceLib.domainHash(DOMAIN), memoHash: invoiceLib.memoHash(details),
    };
    const ctx = { chainId: cfg.chainId, settler: cfg.settler };
    const signature = await merchant.signTypedData(invoiceLib.invoiceTypedData(invoice, ctx) as never);
    const doc: InvoiceDoc = { version: 1, invoice, signature, domain: DOMAIN, details };
    return { cfg, doc, hash: invoiceLib.invoiceHash(invoice, ctx) };
  }

  // The fixture's first payout wallet, as the setup page would offer it.
  async function payoutFromDomain(): Promise<Address> {
    const fx = await import('node:fs').then((fs) =>
      JSON.parse(fs.readFileSync(new URL('../../../../fixtures/domains/northlight-design.example.json', import.meta.url), 'utf8')),
    );
    return fx.payoutAddresses[0] as Address;
  }

  async function pollStatus(hash: Hex, want: string, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const rec = await httpApi.getInvoice(hash);
      if (rec.status === want) return rec;
      await sleep(500);
    }
    throw new Error(`invoice never reached ${want}`);
  }

  it('maps /api/config and /healthz', async () => {
    const cfg = await httpApi.getConfig();
    expect(cfg.chainId).toBe(1874);
    expect(cfg.settler).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(cfg.token).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(cfg.exampleMode).toBe(true);
    const h = await httpApi.healthz();
    expect(h.ok).toBe(true);
    expect(['mock', 'testnet']).toContain(h.chainMode);
  });

  it('create, get, verify, pay now, list and CSV', async () => {
    const { cfg, doc, hash } = await makeDoc(30 * DAY, 'Smoke pay now');
    const created = await httpApi.createInvoice(doc);
    expect(created.hash).toBe(hash); // server hash equals the hash the page computed with invoice-lib

    const rec = await httpApi.getInvoice(hash);
    expect(rec.status).toBe('ISSUED');
    expect(rec.doc.invoice.payout.toLowerCase()).toBe(doc.invoice.payout.toLowerCase());

    const v = await httpApi.verifyHash(hash);
    expect(v.result).toBe('PASS');
    expect(v.checks.length).toBe(10);

    const { typed, validAfter, validBefore } = invoiceLib.receiveWithAuthorizationTypedData({
      invoice: doc.invoice, invoiceHash: hash, from: buyer.address, settler: cfg.settler, mode: 'now', chainId: cfg.chainId,
    });
    const sig = invoiceLib.splitSignature(await buyer.signTypedData(typed as never));
    const res = await httpApi.authorize(hash, { mode: 'now', from: buyer.address, validAfter, validBefore, ...sig });
    expect(['PAID', 'PENDING']).toContain(res.status);

    const paid = await pollStatus(hash, 'PAID');
    expect(paid.tx?.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(paid.tx?.payer?.toLowerCase()).toBe(buyer.address.toLowerCase());
    expect(paid.events?.length).toBeGreaterThan(0);

    const list = await httpApi.listMerchantInvoices(merchant.address);
    const row = list.find((r) => r.hash === hash);
    expect(row?.status).toBe('PAID');
    expect(row?.txHash).toBeTruthy();

    const csv = await (await httpApi.exportCsv(merchant.address)).text();
    expect(csv).toContain(doc.invoice.invoiceId.slice(2));

    // A second payment is refused with a code the UI has a message for.
    await expect(httpApi.authorize(hash, { mode: 'now', from: buyer.address, validAfter, validBefore, ...sig })).rejects.toBeInstanceOf(ApiError);
  });

  it('a swapped payout copy FAILS verification and is refused at create (the #doc link attack)', async () => {
    const { doc } = await makeDoc(30 * DAY, 'Smoke swapped');
    const swapped: InvoiceDoc = { ...doc, invoice: { ...doc.invoice, payout: '0x000000000000000000000000000000000000dEaD' } };
    const v = await httpApi.verifyDoc(swapped);
    expect(v.result).toBe('FAIL');
    const failed = v.checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toContain('signature_valid');
    expect(failed).toContain('payout_in_domain_file');
    const err = await httpApi.createInvoice(swapped).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('SIGNATURE_INVALID');
  });

  it('the merchant preview: PASS has no hints, an unlisted payout FAILS with a fix for that payout', async () => {
    const good = await makeDoc(30 * DAY, 'Smoke preview pass');
    await httpApi.createInvoice(good.doc);
    const pass = await httpApi.verifyHash(good.hash);
    expect(pass.result).toBe('PASS');
    expect(merchantHints(pass.checks, DOMAIN)).toEqual([]);

    const bad = await makeDoc(30 * DAY, 'Smoke preview fail', '0x000000000000000000000000000000000000dEaD');
    await httpApi.createInvoice(bad.doc); // the server stores it (the merchant signed it); the buyer's check is what says FAIL
    const fail = await httpApi.verifyHash(bad.hash);
    expect(fail.result).toBe('FAIL');
    const hints = merchantHints(fail.checks, DOMAIN);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('payout wallet is not listed');
    expect(hints[0]).toContain(DOMAIN);
  });

  it('a payout the merchant key signed but never listed in truce.json FAILS the domain check', async () => {
    const { doc } = await makeDoc(30 * DAY, 'Smoke unlisted payout', '0x000000000000000000000000000000000000dEaD');
    const v = await httpApi.verifyDoc(doc); // validly signed, so only the domain-file check can catch it
    expect(v.result).toBe('FAIL');
    const failed = v.checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual(['payout_in_domain_file']);
  });

  it('a due time seconds away (the demo "due in N minutes") is collected by the scheduler', async () => {
    const { cfg, doc, hash } = await makeDoc(6, 'Smoke due in seconds');
    await httpApi.createInvoice(doc);
    const { typed, validAfter, validBefore } = invoiceLib.receiveWithAuthorizationTypedData({
      invoice: doc.invoice, invoiceHash: hash, from: buyer.address, settler: cfg.settler, mode: 'due', chainId: cfg.chainId,
    });
    expect(Number(validAfter)).toBe(Number(doc.invoice.dueDate)); // the window opens at the second the merchant signed
    const sig = invoiceLib.splitSignature(await buyer.signTypedData(typed as never));
    const res = await httpApi.authorize(hash, { mode: 'due', from: buyer.address, validAfter, validBefore, ...sig });
    expect(res.status).toBe('SCHEDULED_OK');
    expect((await httpApi.getInvoice(hash)).status).toBe('SCHEDULED_OK');
    const paid = await pollStatus(hash, 'PAID', 60); // scheduler ticks every 5 s
    expect(paid.tx?.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  }, 60_000);

  it('refunds part of a payment, then the rest, and refuses more than is left', async () => {
    const { cfg, doc, hash } = await makeDoc(30 * DAY, 'Smoke refund');
    await httpApi.createInvoice(doc);
    const { typed, validAfter, validBefore } = invoiceLib.receiveWithAuthorizationTypedData({
      invoice: doc.invoice, invoiceHash: hash, from: buyer.address, settler: cfg.settler, mode: 'now', chainId: cfg.chainId,
    });
    const sig = invoiceLib.splitSignature(await buyer.signTypedData(typed as never));
    await httpApi.authorize(hash, { mode: 'now', from: buyer.address, validAfter, validBefore, ...sig });
    await pollStatus(hash, 'PAID');

    // The refund panel's own steps: read what was refunded from the chain, sign with the payout wallet through the seam, send.
    const refundOnce = async (amount: bigint) => {
      const before = BigInt((await httpApi.verifyHash(hash)).onchain?.refunded ?? '0');
      const signed = await invoiceLib.signRefund({
        payout: doc.invoice.payout, settler: cfg.settler, token: doc.invoice.token, chainId: cfg.chainId, hash, amount, refundedSoFar: before,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600), sign: (t) => merchant.signTypedData(t as never),
      });
      return httpApi.refund(hash, { amount: amount.toString(), from: signed.from, validAfter: signed.validAfter.toString(), validBefore: signed.validBefore.toString(), v: signed.v, r: signed.r, s: signed.s });
    };

    const first = await refundOnce(4000n);
    expect(first).toMatchObject({ status: 'REFUNDED', amount: '4000', refunded: '4000', remaining: '6000' });
    expect(first.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect((await httpApi.verifyHash(hash)).onchain?.refunded).toBe('4000');

    const tooMuch = await refundOnce(6001n).catch((e) => e);
    expect(tooMuch).toBeInstanceOf(ApiError);
    expect((tooMuch as ApiError).code).toBe('REFUND_EXCEEDS_PAID');

    expect(await refundOnce(6000n)).toMatchObject({ status: 'REFUNDED', remaining: '0' });
    const rec = await httpApi.getInvoice(hash);
    expect(rec.events?.filter((e) => e.type === 'refunded').length).toBe(2);
    expect(rec.status).toBe('PAID');

    // The ledger download the dashboard button uses: this invoice appears as issued, payment, refund, refund.
    const ledger = (await (await httpApi.exportLedger(merchant.address)).text()).replace(/^﻿/, '').trimEnd().split('\r\n');
    const mine = ledger.filter((l) => l.includes(doc.invoice.invoiceId));
    expect(mine.map((l) => l.split(',')[1])).toEqual(['issued', 'payment', 'refund', 'refund']);
    expect(mine[1]).toContain('Cash (USDT),Accounts receivable,0.01');
    expect(mine[2]).toContain('Sales returns,Cash (USDT),0.004');
    expect(mine[3]).toContain('Sales returns,Cash (USDT),0.006');
  });

  it('a monthly series makes separate, individually verifiable invoices with their own dates and notes', async () => {
    const first = Math.floor(Date.now() / 1000 / 86400) * 86400 + 30 * 86400; // midnight UTC, 30 days out
    const dues = monthlyDueDates(first, 3);
    const hashes: string[] = [];
    for (const [i, dueAt] of dues.entries()) {
      const { doc, hash } = await makeDoc(0, `Smoke series ${i + 1}`, undefined, { dueAt: Number(dueAt), notes: seriesNote('Net 30', i, dues.length) });
      expect((await httpApi.createInvoice(doc)).hash).toBe(hash);
      hashes.push(hash);
    }
    expect(new Set(hashes).size).toBe(3); // three different invoices, not one repeated
    for (const [i, hash] of hashes.entries()) {
      const rec = await httpApi.getInvoice(hash as Hex);
      expect(rec.status).toBe('ISSUED');
      expect(rec.doc.invoice.dueDate).toBe(dues[i]);
      expect(rec.doc.details.notes).toBe(`Net 30 · Invoice ${i + 1} of 3`);
      expect((await httpApi.verifyHash(hash as Hex)).result).toBe('PASS');
    }
    expect(Number(dues[1])).toBeGreaterThan(Number(dues[0]));
    expect(Number(dues[2])).toBeGreaterThan(Number(dues[1]));
  });

  it('pay on the due date, then cancel', async () => {
    const { cfg, doc, hash } = await makeDoc(10 * 60, 'Smoke scheduled');
    await httpApi.createInvoice(doc);
    const { typed, validAfter, validBefore } = invoiceLib.receiveWithAuthorizationTypedData({
      invoice: doc.invoice, invoiceHash: hash, from: buyer.address, settler: cfg.settler, mode: 'due', chainId: cfg.chainId,
    });
    const sig = invoiceLib.splitSignature(await buyer.signTypedData(typed as never));
    const res = await httpApi.authorize(hash, { mode: 'due', from: buyer.address, validAfter, validBefore, ...sig });
    expect(res.status).toBe('SCHEDULED_OK');

    const scheduled = await httpApi.getInvoice(hash);
    expect(scheduled.status).toBe('SCHEDULED_OK');
    expect(scheduled.mode).toBe('due');

    const cancelTyped = invoiceLib.cancelAuthorizationTypedData({ token: doc.invoice.token, chainId: cfg.chainId, authorizer: buyer.address, nonce: hash });
    const out = await httpApi.cancel(hash, invoiceLib.splitSignature(await buyer.signTypedData(cancelTyped as never)));
    expect(out.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    const after = await pollStatus(hash, 'CANCELLED');
    expect(after.status).toBe('CANCELLED');
  });
});
