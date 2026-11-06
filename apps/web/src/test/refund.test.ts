import { refundNonce, signRefundAuthorization } from '@truce/invoice-lib';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import type { Address, Hex } from '../lib/api/types';
import { invoiceLib } from '../lib/invoiceLib';
import { parseRefundAmount, refundOverlay, remainingToRefund } from '../lib/refund';

describe('remainingToRefund', () => {
  it('is what was paid minus what was returned, never negative', () => {
    expect(remainingToRefund('10000', '0')).toBe(10000n);
    expect(remainingToRefund(10000n, 4000n)).toBe(6000n);
    expect(remainingToRefund('10000', '10000')).toBe(0n);
    expect(remainingToRefund('10000', '12000')).toBe(0n);
  });
});

describe('refundOverlay', () => {
  it('is empty until something is refunded, then partial, then full', () => {
    expect(refundOverlay('10000', '0')).toBeUndefined();
    expect(refundOverlay('10000', '1')).toBe('PARTIALLY_REFUNDED');
    expect(refundOverlay('10000', '9999')).toBe('PARTIALLY_REFUNDED');
    expect(refundOverlay('10000', '10000')).toBe('REFUNDED');
  });
});

describe('parseRefundAmount', () => {
  it('accepts an amount up to what is left', () => {
    expect(parseRefundAmount('0.005', 10_000n)).toEqual({ ok: true, value: 5000n });
    expect(parseRefundAmount('0.01', 10_000n)).toEqual({ ok: true, value: 10_000n });
    expect(parseRefundAmount('1,250.50', 2_000_000_000n)).toEqual({ ok: true, value: 1_250_500_000n });
  });
  it('rejects zero, too much, and anything that is not a USDT amount, with a plain reason', () => {
    expect(parseRefundAmount('0', 10_000n)).toEqual({ ok: false, error: 'Enter an amount above 0' });
    expect(parseRefundAmount('0.010001', 10_000n)).toMatchObject({ ok: false, error: 'At most 0.01 USDT is left to refund' });
    expect(parseRefundAmount('', 10_000n)).toMatchObject({ ok: false });
    expect(parseRefundAmount('abc', 10_000n)).toMatchObject({ ok: false });
    expect(parseRefundAmount('0.0000001', 10_000n)).toMatchObject({ ok: false });
  });
});

describe('invoiceLib.signRefund', () => {
  // Public Anvil development key #3. Holds no funds.
  const payout = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6');
  const hash = ('0x' + 'ab'.repeat(32)) as Hex;
  const settler = '0x00000000000000000000000000005e77100000e1' as Address;
  const token = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7' as Address;
  const validBefore = 1_800_003_600n;

  it('signs exactly what the library signs, with the contract-defined nonce', async () => {
    let prompted: unknown;
    const viaSeam = await invoiceLib.signRefund({
      payout: payout.address, settler, token, chainId: 1874, hash, amount: 5000n, refundedSoFar: 2000n, validBefore,
      sign: async (typed) => {
        prompted = typed;
        return payout.signTypedData(typed as never);
      },
    });
    const direct = await signRefundAuthorization(payout, { settler, amount: 5000n, nonce: refundNonce(hash, 2000n), validBefore }, { chainId: 1874, token });
    expect(viaSeam).toEqual(direct);
    // what the wallet was asked to sign: the settler as recipient, the amount, and the nonce for 2000 already refunded
    expect(prompted).toMatchObject({ primaryType: 'ReceiveWithAuthorization', message: { from: payout.address, to: settler, value: 5000n, nonce: refundNonce(hash, 2000n) } });
    expect(invoiceLib.refundNonce(hash, 2000n)).toBe(refundNonce(hash, 2000n));
  });

  it('gives a different nonce after each refund, so a signature cannot be reused', () => {
    expect(invoiceLib.refundNonce(hash, 0n)).not.toBe(invoiceLib.refundNonce(hash, 5000n));
  });
});
