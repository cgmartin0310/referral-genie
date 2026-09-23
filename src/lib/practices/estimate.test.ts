import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_ESTIMATE_RATES, estimateMonthlyReferrals, parseEstimateRates, sumEstimates } from './estimate';

describe('referral estimate', () => {
  it('sums providers by type across disciplines at the default rates and shows a range', () => {
    const estimate = estimateMonthlyReferrals({ pediatrics: 4, pcp_family_medicine: 8 });
    assert.ok(estimate);
    // 4 × 1 + 8 × 0.5 = 8, as before the rates were split by discipline
    assert.equal(estimate.point, 8);
    assert.equal(estimate.low, 4);
    assert.equal(estimate.high, 12);
    assert.equal(estimate.drivers[0].sourceType, 'pediatrics');
  });

  it('breaks the estimate down by discipline', () => {
    const estimate = estimateMonthlyReferrals({ pediatrics: 2 });
    const speech = estimate?.byDiscipline.find((row) => row.key === 'st');
    // 2 pediatricians × 0.5 speech referrals a month
    assert.equal(speech?.point, 1);
    assert.equal(estimate?.byDiscipline.length, 3);
  });

  it('is unknown, not zero, for an org-only practice', () => {
    assert.equal(estimateMonthlyReferrals({}), null);
    assert.equal(estimateMonthlyReferrals(null), null);
  });

  it('uses the rates a person set', () => {
    const settings = {
      disciplines: [{ key: 'st', label: 'Speech therapy' }, { key: 'feeding', label: 'Feeding' }],
      rates: { st: { pediatrics: 2 }, feeding: { pediatrics: 0.5 } },
    };
    const estimate = estimateMonthlyReferrals({ pediatrics: 2, pcp_family_medicine: 3 }, settings);
    // Pediatrics: 2 × (2 + 0.5); family medicine has no rate here.
    assert.equal(estimate?.point, 5);
    assert.deepEqual(estimate?.byDiscipline.map((row) => [row.label, row.point]), [['Speech therapy', 4], ['Feeding', 1]]);
  });

  it('rolls up a list, in total and by discipline', () => {
    const total = sumEstimates([
      estimateMonthlyReferrals({ pediatrics: 4 }),
      null,
      estimateMonthlyReferrals({ pcp_family_medicine: 2 }),
    ]);
    assert.equal(total.low, 2);
    assert.equal(total.high, 8);
    assert.equal(total.byDiscipline.length, 3);
  });

  it('cleans a saved table and falls back to the defaults when it is empty', () => {
    assert.deepEqual(parseEstimateRates(null), DEFAULT_ESTIMATE_RATES);
    const parsed = parseEstimateRates({
      disciplines: [{ label: ' ABA ' }, { label: '' }, { key: 'st', label: 'Speech' }],
      rates: { aba: { pediatrics: '0.4', pcp_family_medicine: -3, unknown_type: 5 }, st: { pediatrics: 99 } },
    });
    assert.deepEqual(parsed.disciplines, [{ key: 'aba', label: 'ABA' }, { key: 'st', label: 'Speech' }]);
    assert.equal(parsed.rates.aba.pediatrics, 0.4);
    assert.equal(parsed.rates.aba.pcp_family_medicine, 0);
    assert.equal(parsed.rates.st.pediatrics, 20);
    assert.equal('unknown_type' in parsed.rates.aba, false);
  });
});
