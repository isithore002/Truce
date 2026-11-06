import type { Address, AuditEvent, DomainFile, Health, Hex, InvoiceDoc, PayMode, Status, TxInfo } from './types';
import { ZERO_ADDRESS } from './types';

/**
 * EXAMPLE DATA for the mock adapter. Every merchant, client, domain and address here is fictional (*.example domains).
 * The story follows docs/PITCH.md: Northlight Design Studio bills Beta Labs 1,250 USDT on net-30 terms.
 */

export const TRACK_USDT = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7' as Address;
export const MOCK_SETTLER = '0x5e771e4000000000000000000000000000001874' as Address;

export const ADDR = {
  northlightSigner: '0x7a1e3c9b42d5f0e8a6b1c4d7e2f9a3b6c8d0e1f2',
  northlightPayout: '0x3b9c4d2e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
  attackerPayout: '0xbadc0de5a1e4f00d9c2e7b3a8d1f6c4e0b5a9d37',
  otherSigner: '0xe4b7a0d3c6f9e2a5d8b1c4e7f0a3d6c9b2e5f876',
  betaLabs: '0x5e2d8a1c9b3f4e6a7d0b2c5e8f1a4b7d9c3e6f20',
  kestrelOldSigner: '0x9c4e1b7a2d5f8e0c3a6b9d2e5f8a1c4b7e0d3a61',
  kestrelOldPayout: '0x6d3a9f2c5e8b1a4d7c0e3f6a9b2c5d8e1f4a7b03',
  kestrelSigner: '0x2f8a5d1e7c4b0a9f6e3d2c1b8a7f4e5d0c9b6a32',
  kestrelPayout: '0x8b1e4a7d0c3f6e9a2d5b8c1e4f7a0d3c6b9e2f54',
  fernhillSigner: '0x4a7d0c3f6e9a2d5b8c1e4f7a0d3c6b9e2f5a8d17',
  fernhillPayout: '0x0c3f6e9a2d5b8c1e4f7a0d3c6b9e2f5a8d1b4e29',
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
  /** Total refunded so far, in USDT base units (mock only). */
  refunded?: string;
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
