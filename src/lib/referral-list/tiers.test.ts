import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audienceTierFilter, FAXABLE_TIER, parseAudienceTiers, parseTier, tierFromTrustScore, TIER_INFO, TIERS } from './tiers';

describe('referral-list tiers', () => {
  it('knows its four tiers, each with outreach', () => {
    assert.deepEqual([...TIERS], ['trusted', 'warm', 'cold', 'not_fit']);
    for (const tier of TIERS) assert.ok(TIER_INFO[tier].outreach.length > 0);
  });
  it('accepts only known tiers', () => {
    assert.equal(parseTier('warm'), 'warm');
    assert.equal(parseTier('hot'), null);
    assert.equal(parseTier(null), null);
  });
  it('maps the old trust score onto tiers', () => {
    assert.equal(tierFromTrustScore(85), 'trusted');
    assert.equal(tierFromTrustScore(70), 'trusted');
    assert.equal(tierFromTrustScore(55), 'warm');
    assert.equal(tierFromTrustScore(12), 'cold');
  });
});

describe('campaign tiers', () => {
  it('cleans the chosen tiers; all three means everyone', () => {
    assert.deepEqual(parseAudienceTiers(['cold', 'warm', 'bogus', 'not_fit']), ['warm', 'cold']);
    assert.deepEqual(parseAudienceTiers(['trusted', 'warm', 'cold']), []);
    assert.deepEqual(parseAudienceTiers(undefined), []);
  });
  it('faxes the chosen tiers, with not-yet-scored counted as Cold, and never Not a fit', () => {
    assert.deepEqual(audienceTierFilter([]), FAXABLE_TIER);
    assert.deepEqual(audienceTierFilter(['trusted']), { OR: [{ tier: 'trusted' }] });
    assert.deepEqual(audienceTierFilter(['warm', 'cold']), { OR: [{ tier: 'warm' }, { tier: 'cold' }, { tier: null }] });
  });
});
