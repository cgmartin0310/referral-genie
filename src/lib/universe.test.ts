import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextStage } from './universe';

describe('outreach ladder', () => {
  it('moves to coordinator identified when the coordinator is named early in the ladder', () => {
    assert.equal(nextStage('queued', { rcName: 'Tammy at the front desk' }), 'rc_identified');
    assert.equal(nextStage('outreach_active', { rcName: 'Tammy' }), 'rc_identified');
  });

  it('keeps a later stage when the coordinator changes, and lets an explicit stage win', () => {
    assert.equal(nextStage('engaged', { rcName: 'New person' }), 'engaged');
    assert.equal(nextStage('queued', { stage: 'graduated', rcName: 'Tammy' }), 'graduated');
    assert.equal(nextStage('queued', { stage: 'not-a-stage' }), 'queued');
    assert.equal(nextStage('queued', { rcName: '  ' }), 'queued');
  });
});
