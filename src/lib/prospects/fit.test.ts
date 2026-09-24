import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitScore } from './fit';

describe('prospect fit', () => {
  it('rates a large, close pediatric practice highly for a pediatric clinic', () => {
    assert.equal(fitScore({ estimatePoint: 6, miles: 1.2, providers: 6, pediatricShare: 1, clinicSeesChildren: true }), 94);
  });

  it('rates a far, small adult practice low for a pediatric clinic', () => {
    assert.equal(fitScore({ estimatePoint: 0.5, miles: 40, providers: 1, pediatricShare: 0, clinicSeesChildren: true }), 10);
  });

  it('scores distance as unknown, not zero, when a place is missing', () => {
    const known = fitScore({ estimatePoint: 2, miles: 20, providers: 2, pediatricShare: 0, clinicSeesChildren: false });
    const unknown = fitScore({ estimatePoint: 2, miles: null, providers: 2, pediatricShare: 0, clinicSeesChildren: false });
    assert.equal(known, unknown);
  });
});
