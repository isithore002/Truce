import { ApiError, type TruceApi } from './client';
import {
  buildFixtures, DOMAIN_FILES, KESTREL_PRIOR_PIN, MOCK_ACCOUNTS, MOCK_SETTLER, TRACK_USDT, type MockRecord,
} from './fixtures';
import type { Check, CheckId, Hex, InvoiceDoc, InvoiceRecord, InvoiceSummary, VerifyResponse } from './types';
import { CHECK_IDS, ZERO_ADDRESS } from './types';
import { EXPLORER, explorerTx } from '../config';
import { formatUsdt, isAddress, isHash, sameAddress } from '../format';
import { randomHex } from '../invoiceLib';
import { checkMessage, errorMessage } from '../messages';
import { getPin, savePin } from '../pins';

/**
 * Scenario adapter with the same interface as the HTTP client. No keys, no network.
 * Verification is simulated by comparing a document with the copy the merchant "signed" (kept in memory);
 * it does not hash or recover signatures. Everything it returns is EXAMPLE DATA.
 */

const STORE_KEY = 'truce.mock.v1';
const now = () => Math.floor(Date.now() / 1000);
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms + Math.random() * 250));

let records = new Map<Hex, MockRecord>();
let block = 4_812_330;

function load() {
  records = new Map(buildFixtures().map((r) => [r.hash, r]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<Hex, MockRecord>;
    for (const [h, r] of Object.entries(saved)) records.set(h as Hex, r);
  } catch {
    /* no storage */
  }
  try {
    if (!getPin(KESTREL_PRIOR_PIN.domain)) savePin(KESTREL_PRIOR_PIN.domain, KESTREL_PRIOR_PIN, undefined, new Date(Date.now() - 40 * 86_400_000));
  } catch {
    /* no storage */
  }
}

function persist(r: MockRecord) {
  records.set(r.hash, r);
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, MockRecord>;
    saved[r.hash] = r;
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch {
    /* no storage */
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* no storage */
  }
  load();
}

load();

const get = (hash: Hex) => {
  const r = records.get(hash.toLowerCase() as Hex) ?? [...records.values()].find((x) => x.hash.toLowerCase() === hash.toLowerCase());
  if (!r) throw new ApiError('NOT_FOUND', errorMessage('NOT_FOUND'), 404);
  return r;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function validShape(doc: InvoiceDoc): boolean {
  const i = doc?.invoice;
  return !!(
    doc && doc.version === 1 && i && typeof doc.domain === 'string' && doc.details && Array.isArray(doc.details.lineItems) &&
    isHash(i.invoiceId) && [i.merchant, i.payout, i.token, i.payer].every((a) => typeof a === 'string' && isAddress(a)) &&
    [i.amount, i.dueDate, i.expiry].every((n) => typeof n === 'string' && /^\d+$/.test(n)) &&
    isHash(i.domainHash) && isHash(i.memoHash) && /^0x[0-9a-fA-F]{130}$/.test(doc.signature)
  );
}

/** Simulated ten checks: compare against the signed copy and the fixture domain files. */
export function simulateVerify(doc: InvoiceDoc): VerifyResponse {
  const ok: Partial<Record<CheckId, boolean>> = {};
  const shape = validShape(doc);
  ok.document_valid = shape;
  if (shape) {
    const signed = [...records.values()].find((r) => r.signed.invoice.invoiceId === doc.invoice.invoiceId)?.signed;
    const file = DOMAIN_FILES[doc.domain.toLowerCase()];
    ok.signature_valid = !!signed && signed.signature === doc.signature && same(signed.invoice, doc.invoice);
    ok.domain_file_reachable = !!file;
    ok.merchant_matches_domain_file = !!file && sameAddress(file.signingAddress, doc.invoice.merchant);
    ok.payout_in_domain_file = !!file && file.payoutAddresses.some((p) => sameAddress(p, doc.invoice.payout));
    ok.domain_hash_matches = !!signed && signed.domain === doc.domain;
    ok.chain_and_token_allowed = sameAddress(doc.invoice.token, TRACK_USDT) && (!file || file.chainIds.includes(1874));
    ok.not_expired = Number(doc.invoice.expiry) > now();
    ok.memo_hash_matches_details = !!signed && same(signed.details, doc.details);
    ok.payer_ok = sameAddress(doc.invoice.payer, ZERO_ADDRESS) || sameAddress(doc.invoice.payer, MOCK_ACCOUNTS.buyer);
  }
  const checks: Check[] = CHECK_IDS.map((id) => {
    const pass = ok[id] ?? false;
    return { id, ok: pass, message: checkMessage(id, pass, { domain: doc?.domain ?? 'the domain' }).text };
  });
  return { result: checks.every((c) => c.ok) ? 'PASS' : 'FAIL', checks };
}

const toRecord = (r: MockRecord): InvoiceRecord => ({
  hash: r.hash, doc: r.doc, status: r.status, health: r.health, tx: r.tx, events: r.events, mode: r.mode,
});

const toSummary = (r: MockRecord): InvoiceSummary => ({
  hash: r.hash, invoiceId: r.doc.invoice.invoiceId, clientName: r.doc.details.clientName, amount: r.doc.invoice.amount,
  dueDate: r.doc.invoice.dueDate, status: r.status, healthReason: r.health?.reason, txHash: r.tx?.txHash, paidAt: r.tx?.paidAt,
  example: r.doc.details.example,
});

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const mockApi: TruceApi = {
  mode: 'mock',

  async getConfig() {
    await wait(120);
    return { chainId: 1874, settler: MOCK_SETTLER, token: TRACK_USDT, tokenSymbol: 'USDT', tokenDecimals: 6, explorerUrl: EXPLORER, exampleMode: true };
  },

  async createInvoice(doc) {
    await wait();
    if (!validShape(doc)) throw new ApiError('INVALID_DOCUMENT', errorMessage('INVALID_DOCUMENT'), 400);
    if ([...records.values()].some((r) => r.signed.invoice.invoiceId === doc.invoice.invoiceId)) throw new ApiError('DUPLICATE', errorMessage('DUPLICATE'), 409);
    const hash = randomHex();
    persist({ hash, signed: doc, doc, status: 'ISSUED', listed: true, events: [{ at: new Date().toISOString(), type: 'created', detail: 'Invoice signed and published' }] });
    return { hash, link: `${location.origin}/pay/${hash}` };
  },

  async getInvoice(hash) {
    await wait();
    return toRecord(get(hash));
  },

  async verifyHash(hash) {
    await wait(450);
    return simulateVerify(get(hash).doc);
  },

  async verifyDoc(doc) {
    await wait(450);
    return simulateVerify(doc);
  },

  async authorize(hash, auth) {
    await wait(700);
    const r = get(hash);
    if (r.authorizeError) throw new ApiError(r.authorizeError, errorMessage(r.authorizeError), 409);
    if (r.status === 'PAID') throw new ApiError('ALREADY_PAID', errorMessage('ALREADY_PAID'), 409);
    if (simulateVerify(r.doc).result !== 'PASS') throw new ApiError('SIGNATURE_INVALID', errorMessage('SIGNATURE_INVALID'), 400);
    if (Number(r.doc.invoice.expiry) <= now()) throw new ApiError('EXPIRED', errorMessage('EXPIRED'), 400);
    const at = new Date().toISOString();
    if (auth.mode === 'due') {
      persist({
        ...r, status: 'SCHEDULED_OK', mode: 'due', health: { ok: true, reason: 'NONE', checkedAt: at },
        events: [...r.events, { at, type: 'authorized', detail: 'Buyer signed a payment for the due date' }, { at, type: 'scheduled', detail: 'Collection set for the due date' }],
      });
      return { status: 'SCHEDULED_OK' as const };
    }
    persist({ ...r, mode: 'now', events: [...r.events, { at, type: 'authorized', detail: 'Buyer signed a pay-now authorization' }] });
    setTimeout(() => {
      const cur = get(hash);
      const txHash = randomHex();
      const paidAt = new Date().toISOString();
      block += 3;
      persist({
        ...cur, status: 'PAID', tx: { txHash, payer: auth.from, paidAt },
        events: [...cur.events, { at: paidAt, type: 'paid', detail: `${formatUsdt(cur.doc.invoice.amount)} USDT settled to the signed payout wallet`, txHash }],
      });
    }, 1600);
    return { status: 'PENDING' as const };
  },

  async cancel(hash) {
    await wait(600);
    const r = get(hash);
    if (!['SCHEDULED_OK', 'AT_RISK', 'FAILED'].includes(r.status)) throw new ApiError('NOT_SCHEDULED', errorMessage('NOT_SCHEDULED'), 409);
    const txHash = randomHex();
    persist({ ...r, status: 'CANCELLED', health: undefined, events: [...r.events, { at: new Date().toISOString(), type: 'cancelled', detail: 'Buyer cancelled the scheduled payment', txHash }] });
    return { txHash };
  },

  async listMerchantInvoices(address) {
    await wait();
    return [...records.values()]
      .filter((r) => r.listed && sameAddress(r.doc.invoice.merchant, address))
      .sort((a, b) => Number(b.doc.invoice.dueDate) - Number(a.doc.invoice.dueDate))
      .map(toSummary);
  },

  async exportCsv(address) {
    await wait(200);
    const rows = (await mockApi.listMerchantInvoices(address)).map((s) => {
      const r = get(s.hash);
      return [
        s.invoiceId, r.doc.details.merchantName, s.clientName, formatUsdt(s.amount, { fixed: true }),
        new Date(Number(s.dueDate) * 1000).toISOString(), s.status, s.txHash ? explorerTx(s.txHash) : '', s.paidAt ?? '',
      ].map(csvCell).join(',');
    });
    const head = 'invoice_id,merchant_name,client_name,amount_usdt,due_date_utc,status,tx_link,paid_at';
    return new Blob([[head, ...rows].join('\n') + '\n'], { type: 'text/csv' });
  },

  async healthz() {
    await wait(150);
    block += Math.floor(Math.random() * 4) + 1;
    const lastEvents = [...records.values()]
      .flatMap((r) => r.events.map((e) => ({ at: e.at, event: e.type, hash: r.hash })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6);
    return { ok: true, chainMode: 'mock', block: String(block), relayerBalanceWei: '1840000000000000000', lastEvents };
  },
};

/** Demo helper: the signed copy for a hash, so /demo can build tampered links from it. */
export const mockSignedDoc = (hash: Hex): InvoiceDoc | undefined => records.get(hash)?.signed;
