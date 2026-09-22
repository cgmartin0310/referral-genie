import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateMonthlyReferrals, sumEstimates } from './estimate';

describe('referral estimate', () => {
  it('sums providers by type at the default rates and shows a range', () => {
    const estimate = estimateMonthlyReferrals({ pediatrics: 4, pcp_family_medicine: 8 });
    assert.ok(estimate);
    // 4 × 1 + 8 × 0.5 = 8
    assert.equal(estimate.point, 8);
    assert.equal(estimate.low, 4);
    assert.equal(estimate.high, 12);
    assert.equal(estimate.drivers[0].sourceType, 'pediatrics');
  });

  it('is unknown, not zero, for an org-only practice', () => {
    assert.equal(estimateMonthlyReferrals({}), null);
    assert.equal(estimateMonthlyReferrals(null), null);
  });

  it('accepts tenant rates', () => {
    const estimate = estimateMonthlyReferrals({ pediatrics: 2 }, { pediatrics: 3 });
    assert.equal(estimate?.point, 6);
  });

  it('rolls up a list', () => {
    const total = sumEstimates([
      estimateMonthlyReferrals({ pediatrics: 4 }),
      null,
      estimateMonthlyReferrals({ pcp_family_medicine: 2 }),
    ]);
    assert.deepEqual(total, { low: 2, high: 8 });
  });
});
