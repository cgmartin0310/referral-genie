import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextStage, stageAfterCall } from './universe';

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

describe('calls on the ladder', () => {
  it('starts outreach, then identifies, then engages the coordinator', () => {
    assert.equal(stageAfterCall('queued', 'voicemail'), 'outreach_active');
    assert.equal(stageAfterCall('queued', 'rc_named'), 'rc_identified');
    assert.equal(stageAfterCall('outreach_active', 'rc_reached'), 'rc_identified');
    assert.equal(stageAfterCall('rc_identified', 'rc_reached'), 'engaged');
  });

  it('never walks a practice back down the ladder', () => {
    assert.equal(stageAfterCall('engaged', 'no_answer'), 'engaged');
    assert.equal(stageAfterCall('graduated', 'rc_named'), 'graduated');
  });
});
