import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audienceTierFilter, faxableEntries, parseAudienceTiers, parseTier, tierFromTrustScore, TIER_INFO, TIERS } from './tiers';

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
  it('faxes the chosen tiers of the company score, with not-yet-scored counted as Cold, and never Not a fit', () => {
    assert.deepEqual(audienceTierFilter('org1', []), faxableEntries('org1'));
    assert.deepEqual(faxableEntries('org1'), { excludedAt: null, practice: { scores: { none: { organizationId: 'org1', tier: 'not_fit' } } } });
    assert.deepEqual(audienceTierFilter('org1', ['trusted']), {
      excludedAt: null,
      OR: [{ practice: { scores: { some: { organizationId: 'org1', tier: { in: ['trusted'] } } } } }],
    });
    assert.deepEqual(audienceTierFilter('org1', ['warm', 'cold']), {
      excludedAt: null,
      OR: [
        { practice: { scores: { some: { organizationId: 'org1', tier: { in: ['warm', 'cold'] } } } } },
        { practice: { scores: { none: { organizationId: 'org1' } } } },
      ],
    });
  });
});
