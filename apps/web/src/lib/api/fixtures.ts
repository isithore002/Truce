import type { Address, AuditEvent, DomainFile, Health, Hex, InvoiceDoc, PayMode, Status, TxInfo } from './types';
import { ZERO_ADDRESS } from './types';

/**
 * EXAMPLE DATA for the mock adapter. Every merchant, client, domain and address here is fictional (*.example domains).
 * The story follows docs/PITCH.md: Northlight Design Studio bills Beta Labs 1,250 USDT on net-30 terms.
 */

export const TRACK_USDT = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7' as Address;
export const MOCK_SETTLER = '0x5e771e4000000000000000000000000000001874' as Address;

export const ADDR = {
  northlightSigner: '0x7a1E3c9B42d5F0e8A6b1C4d7E2f9a3B6c8D0e1F2',
  northlightPayout: '0x3B9c4D2e5F6a7B8c9D0e1F2a3B4c5D6e7F8a9B0c',
  attackerPayout: '0xBadC0de5a1e4F00d9C2e7b3A8d1F6c4E0b5A9d37',
  otherSigner: '0xE4b7A0d3C6f9E2a5D8b1C4e7F0a3D6c9B2e5F876',
  betaLabs: '0x5e2D8a1C9b3F4e6A7d0B2c5E8f1A4b7D9c3E6f20',
  kestrelOldSigner: '0x9C4e1B7a2D5f8E0c3A6b9D2e5F8a1C4b7E0d3A61',
  kestrelOldPayout: '0x6D3a9F2c5E8b1A4d7C0e3F6a9B2c5D8e1F4a7B03',
  kestrelSigner: '0x2f8A5d1E7c4B0a9F6e3D2c1B8a7F4e5D0c9B6a32',
  kestrelPayout: '0x8B1e4A7d0C3f6E9a2D5b8C1e4F7a0D3c6B9e2F54',
  fernhillSigner: '0x4A7d0C3f6E9a2D5b8C1e4F7a0D3c6B9e2F5a8D17',
  fernhillPayout: '0x0C3f6E9a2D5b8C1e4F7a0D3c6B9e2F5a8D1b4E29',
} as const satisfies Record<string, Address>;

/** Mock wallet accounts: the merchant pages sign as Northlight, the buyer pages as Beta Labs. */
export const MOCK_ACCOUNTS = { merchant: ADDR.northlightSigner as Address, buyer: ADDR.betaLabs as Address };

export const DOMAIN_FILES: Record<string, DomainFile> = {
  'northlight-design.example': {
    version: 1, name: 'Northlight Design Studio', signingAddress: ADDR.northlightSigner, payoutAddresses: [ADDR.northlightPayout], chainIds: [1874],
  },
  'kestrel-print.example': {
    version: 1, name: 'Kestrel Print Co.', signingAddress: ADDR.kestrelSigner, payoutAddresses: [ADDR.kestrelPayout], chainIds: [1874],
  },
  // fernhill-audio.example has no reachable file: the domainUnreachable scenario
};

/** The pin the buyer "made" on an earlier Kestrel payment, before Kestrel's wallets changed. */
export const KESTREL_PRIOR_PIN = { domain: 'kestrel-print.example', signingAddress: ADDR.kestrelOldSigner as Address, payoutAddresses: [ADDR.kestrelOldPayout as Address] };

/** Deterministic hex for mock ids (xorshift on a seed). Not a hash: the mock never claims cryptography. */
export function seededHex(seed: string, bytes = 32): Hex {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619) >>> 0;
  let out = '';
  for (let i = 0; i < bytes; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    out += (x & 0xff).toString(16).padStart(2, '0');
  }
  return `0x${out}`;
}

const DAY = 86_400;

export const SCENARIO_IDS = [
  'pass', 'swappedPayout', 'tamperedAmount', 'wrongSigner', 'expired', 'domainUnreachable',
  'alreadyPaid', 'paid', 'atRisk', 'failed', 'scheduled', 'pinChanged',
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  expect: 'PASS' | 'FAIL';
  /** shown in the demo switcher */
  about: string;
}

export const SCENARIOS: ScenarioMeta[] = [
  { id: 'pass', label: 'Honest invoice', expect: 'PASS', about: 'Northlight bills Beta Labs 1,250 USDT, net 30.' },
  { id: 'swappedPayout', label: 'Swapped payout wallet', expect: 'FAIL', about: 'The emailed copy pays an attacker wallet.' },
  { id: 'tamperedAmount', label: 'Tampered amount', expect: 'FAIL', about: 'The amount was raised after signing.' },
  { id: 'wrongSigner', label: 'Wrong signer', expect: 'FAIL', about: 'Signed by a wallet the domain does not list.' },
  { id: 'expired', label: 'Expired invoice', expect: 'FAIL', about: 'The payment window has closed.' },
  { id: 'domainUnreachable', label: 'Domain file missing', expect: 'FAIL', about: 'fernhill-audio.example serves no truce.json.' },
  { id: 'alreadyPaid', label: 'Paid elsewhere', expect: 'PASS', about: 'Passes, but the relayer reports it is already paid.' },
  { id: 'paid', label: 'Paid, with receipt', expect: 'PASS', about: 'Settled on chain, with a transaction link.' },
  { id: 'atRisk', label: 'Scheduled, at risk', expect: 'PASS', about: 'Due-date payment; buyer balance is low.' },
  { id: 'failed', label: 'Collection failed', expect: 'PASS', about: 'Due-date collection failed; it retries.' },
  { id: 'scheduled', label: 'Scheduled, OK', expect: 'PASS', about: 'Due-date payment; last check passed.' },
  { id: 'pinChanged', label: 'Wallets changed', expect: 'PASS', about: 'Kestrel’s wallets differ from your last payment.' },
];

export interface MockRecord {
  hash: Hex;
  /** what the merchant actually signed */
  signed: InvoiceDoc;
  /** what this link serves (differs from `signed` for the attack copies) */
  doc: InvoiceDoc;
  status: Status;
  health?: Health;
  tx?: TxInfo;
  mode?: PayMode;
  events: AuditEvent[];
  /** shown in the merchant's own list (attack copies are not) */
  listed: boolean;
  scenario?: ScenarioId;
  authorizeError?: string;
}

function northlightDoc(seed: string, now: number, over: { due?: number; expiry?: number; client?: string; item?: string; amount?: string } = {}): InvoiceDoc {
  const due = over.due ?? now + 30 * DAY;
  const amount = over.amount ?? '1250000000';
  return {
    version: 1,
    invoice: {
      invoiceId: `0x${'0'.repeat(32)}${seededHex(`id:${seed}`, 16).slice(2)}`,
      merchant: ADDR.northlightSigner, payout: ADDR.northlightPayout, token: TRACK_USDT, amount,
      dueDate: String(due), expiry: String(over.expiry ?? due + 3 * DAY), payer: ZERO_ADDRESS,
      domainHash: seededHex('domain:northlight-design.example'), memoHash: seededHex(`memo:${seed}`),
    },
    signature: seededHex(`sig:${seed}`, 65),
    domain: 'northlight-design.example',
    details: {
      merchantName: 'Northlight Design Studio', clientName: over.client ?? 'Beta Labs',
      lineItems: [{ description: over.item ?? 'Brand identity', quantity: '1', unitPrice: amount }],
      notes: 'Net 30', example: true,
    },
  };
}

const iso = (sec: number) => new Date(sec * 1000).toISOString();

function rec(id: ScenarioId, signed: InvoiceDoc, part: Partial<MockRecord> = {}): MockRecord {
  const created = Number(signed.invoice.dueDate) - 30 * DAY;
  return {
    hash: seededHex(`hash:${id}`), signed, doc: signed, status: 'ISSUED', listed: true, scenario: id,
    events: [{ at: iso(Math.min(created, Math.floor(Date.now() / 1000) - 3600)), type: 'created', detail: 'Invoice signed and published' }],
    ...part,
  };
}

/** Builds the scenario set relative to `now` (unix seconds) so due dates stay in the future. */
export function buildFixtures(now = Math.floor(Date.now() / 1000)): MockRecord[] {
  const pass = northlightDoc('pass', now);
  const swapped = { ...pass, invoice: { ...pass.invoice, payout: ADDR.attackerPayout as Address } };
  const tampered = { ...pass, invoice: { ...pass.invoice, amount: '12500000000' } };
  const wrong = northlightDoc('wrong', now);
  wrong.invoice.merchant = ADDR.otherSigner;
  wrong.signature = seededHex('sig:attacker', 65);
  const expired = northlightDoc('expired', now, { due: now - 10 * DAY, expiry: now - 7 * DAY, item: 'Website audit', amount: '480000000' });
  const fern = northlightDoc('fern', now, { item: 'Podcast mixing', amount: '320000000' });
  fern.domain = 'fernhill-audio.example';
  fern.invoice.merchant = ADDR.fernhillSigner; fern.invoice.payout = ADDR.fernhillPayout;
  fern.details.merchantName = 'Fernhill Audio';
  const already = northlightDoc('already', now, { item: 'Logo refresh', amount: '640000000' });
  const paid = northlightDoc('paid', now, { due: now - 2 * DAY, item: 'Pitch deck design', amount: '900000000' });
  const atRisk = northlightDoc('atRisk', now, { due: now + 2 * DAY, item: 'Packaging concepts', amount: '1750000000', client: 'Orbit Foods' });
  const failed = northlightDoc('failed', now, { due: now - DAY, item: 'Icon set', amount: '560000000', client: 'Orbit Foods' });
  const sched = northlightDoc('scheduled', now, { due: now + 9 * DAY, item: 'Brand guidelines', amount: '2100000000' });
  const kestrel = northlightDoc('kestrel', now, { item: 'Trade show banners', amount: '415000000' });
  kestrel.domain = 'kestrel-print.example';
  kestrel.invoice.merchant = ADDR.kestrelSigner; kestrel.invoice.payout = ADDR.kestrelPayout;
  kestrel.details.merchantName = 'Kestrel Print Co.';

  const paidTx = seededHex('tx:paid');
  const authorized = (at: number): AuditEvent => ({ at: iso(at), type: 'authorized', detail: 'Buyer signed a payment for the due date' });
  return [
    rec('pass', pass),
    rec('swappedPayout', pass, { doc: swapped, listed: false }),
    rec('tamperedAmount', pass, { doc: tampered, listed: false }),
    rec('wrongSigner', wrong, { listed: false }),
    rec('expired', expired, { status: 'EXPIRED' }),
    rec('domainUnreachable', fern, { listed: false }),
    rec('alreadyPaid', already, { authorizeError: 'ALREADY_PAID' }),
    rec('paid', paid, {
      status: 'PAID', tx: { txHash: paidTx, payer: ADDR.betaLabs, paidAt: iso(now - 2 * DAY + 40) }, mode: 'now',
      events: [
        { at: iso(now - 9 * DAY), type: 'created', detail: 'Invoice signed and published' },
        { at: iso(now - 2 * DAY), type: 'authorized', detail: 'Buyer signed a pay-now authorization' },
        { at: iso(now - 2 * DAY + 40), type: 'paid', detail: '900 USDT settled to the signed payout wallet', txHash: paidTx },
      ],
    }),
    rec('atRisk', atRisk, {
      status: 'AT_RISK', mode: 'due', health: { ok: false, reason: 'LOW_BALANCE', checkedAt: iso(now - 600) },
      events: [{ at: iso(now - 5 * DAY), type: 'created' }, authorized(now - 4 * DAY), { at: iso(now - 600), type: 'at_risk', detail: 'Buyer wallet holds 1,020 USDT of 1,750 USDT' }],
    }),
    rec('failed', failed, {
      status: 'FAILED', mode: 'due', health: { ok: false, reason: 'LOW_BALANCE', checkedAt: iso(now - 1800) },
      events: [{ at: iso(now - 8 * DAY), type: 'created' }, authorized(now - 7 * DAY), { at: iso(now - DAY), type: 'failed', detail: 'Balance too low at the due date; retrying' }],
    }),
    rec('scheduled', sched, {
      status: 'SCHEDULED_OK', mode: 'due', health: { ok: true, reason: 'NONE', checkedAt: iso(now - 900) },
      events: [{ at: iso(now - 3 * DAY), type: 'created' }, authorized(now - 2 * DAY), { at: iso(now - 2 * DAY + 60), type: 'scheduled', detail: 'Collection set for the due date' }],
    }),
    rec('pinChanged', kestrel, { listed: false }),
  ];
}

export const scenarioHash = (id: ScenarioId): Hex => seededHex(`hash:${id}`);
