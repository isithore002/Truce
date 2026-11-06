import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PayPanel } from '../components/pay/PayPanel';
import { ADDR, buildFixtures, SCENARIOS } from '../lib/api/fixtures';
import { simulateVerify } from '../lib/api/mock';
import type { Address, InvoiceDoc } from '../lib/api/types';
import { payGate, type PayGateInput } from '../lib/payGate';

const records = buildFixtures();
const byScenario = new Map(records.map((r) => [r.scenario!, r]));
const base: Omit<PayGateInput, 'verify' | 'doc' | 'status'> = { settlerKnown: true, pin: { state: 'NEW' } };

const renderPanel = (gate: ReturnType<typeof payGate>) =>
  renderToStaticMarkup(
    <PayPanel gate={gate} amount="1250000000" dueDate="1800000000" mode="now" onMode={() => {}} dueDateFeature={false} step="idle" connected onPay={() => {}} />,
  );
const payButton = (html: string) => html.match(/<button[^>]*data-testid="pay-button"[^>]*>/)![0];

describe('Pay is disabled for every FAIL scenario', () => {
  const fails = SCENARIOS.filter((s) => s.expect === 'FAIL');
  it('covers the FAIL scenarios', () => expect(fails.map((s) => s.id)).toEqual(['swappedPayout', 'tamperedAmount', 'wrongSigner', 'expired', 'domainUnreachable']));

  for (const s of fails) {
    it(`${s.id}: verify FAILs and the Pay button is disabled`, () => {
      const r = byScenario.get(s.id)!;
      const verify = simulateVerify(r.doc);
      expect(verify.result).toBe('FAIL');
      // even with a stored status of ISSUED, a FAIL keeps Pay off
      const gate = payGate({ ...base, verify, doc: r.doc, status: 'ISSUED' });
      expect(gate.enabled).toBe(false);
      expect(payButton(renderPanel(gate))).toMatch(/ disabled=""/);
    });
  }

  it('swappedPayout fails exactly the signature and payout checks', () => {
    const v = simulateVerify(byScenario.get('swappedPayout')!.doc);
    expect(v.checks.filter((c) => !c.ok).map((c) => c.id).sort()).toEqual(['payout_in_domain_file', 'signature_valid']);
  });

  it('tampered #doc copies of the honest invoice FAIL and never enable Pay', () => {
    const d = byScenario.get('pass')!.doc;
    const copies: InvoiceDoc[] = [
      { ...d, invoice: { ...d.invoice, payout: ADDR.attackerPayout as Address } },
      { ...d, invoice: { ...d.invoice, amount: '12500000000' } },
      { ...d, details: { ...d.details, clientName: 'Someone else' } },
      { ...d, domain: 'kestrel-print.example' },
    ];
    for (const c of copies) {
      const verify = simulateVerify(c);
      expect(verify.result).toBe('FAIL');
      expect(payGate({ ...base, verify, doc: c, fromDocLink: true }).enabled).toBe(false);
      expect(payGate({ ...base, verify, doc: c }).enabled).toBe(false);
    }
  });
});

describe('Pay gate on PASS', () => {
  const pass = byScenario.get('pass')!;
  const verify = simulateVerify(pass.doc);
  it('enables Pay for an honest unpaid invoice', () => {
    expect(verify.result).toBe('PASS');
    const gate = payGate({ ...base, verify, doc: pass.doc, status: 'ISSUED' });
    expect(gate.enabled).toBe(true);
    const html = renderPanel(gate);
    expect(payButton(html)).not.toMatch(/ disabled=""/);
    expect(html).toContain('Pay 1,250 USDT');
  });
  it('blocks a #doc copy even on PASS (not stored)', () => {
    expect(payGate({ ...base, verify, doc: pass.doc, fromDocLink: true }).enabled).toBe(false);
  });
  it('requires confirmation when the pinned wallets changed', () => {
    const pin = {
      state: 'CHANGED' as const, pin: { signingAddress: ADDR.kestrelOldSigner as Address, payoutAddresses: [], pinnedAt: '' },
      signingChanged: true, payoutChanged: true, current: { signingAddress: pass.doc.invoice.merchant, payout: pass.doc.invoice.payout },
    };
    expect(payGate({ ...base, verify, doc: pass.doc, pin, pinConfirmed: false }).enabled).toBe(false);
    expect(payGate({ ...base, verify, doc: pass.doc, pin, pinConfirmed: true }).enabled).toBe(true);
  });
  it('blocks paid, scheduled, cancelled and expired invoices, wrong payers and a missing library', () => {
    for (const status of ['PAID', 'SCHEDULED_OK', 'AT_RISK', 'FAILED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(payGate({ ...base, verify, doc: pass.doc, status }).enabled).toBe(false);
    }
    const locked = { ...pass.doc, invoice: { ...pass.doc.invoice, payer: ADDR.betaLabs as Address } };
    expect(payGate({ ...base, verify, doc: locked, account: ADDR.otherSigner as Address }).enabled).toBe(false);
    expect(payGate({ ...base, verify, doc: pass.doc, settlerKnown: false }).enabled).toBe(false);
  });
});
