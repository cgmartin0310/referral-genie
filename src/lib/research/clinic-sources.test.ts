import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LENOIR_NC } from '../nppes/counties';
import { researchCountyFips, seedIdsForMarket, sourceIdsMatchingFips } from './clinic-sources';
import { researchCountMessage } from './status-message';

describe('research source counties', () => {
  it('selects the same Lenoir FIPS the pull writes', () => {
    assert.deepEqual(researchCountyFips(['37107']), [LENOIR_NC.fips]);
    assert.deepEqual(seedIdsForMarket(['37107']), ['lenoir-nc']);
    assert.deepEqual(
      sourceIdsMatchingFips(
        [
          { id: 'lenoir', countyFips: '37107' },
          { id: 'other', countyFips: '06037' },
          { id: 'blank', countyFips: null },
        ],
        researchCountyFips(['37107']),
      ),
      ['lenoir'],
    );
  });

  it('normalizes market FIPS that diverge from the ingest code', () => {
    assert.deepEqual(seedIdsForMarket([' 37-107 ', 'lenoir-nc']), ['lenoir-nc']);
    const fips = researchCountyFips(['37-107', 'lenoir-nc', '37107 ']);
    assert.equal(fips.includes(LENOIR_NC.fips), true);
    assert.deepEqual(
      sourceIdsMatchingFips(
        [
          { id: 'canonical', countyFips: LENOIR_NC.fips },
          { id: 'spaced', countyFips: ' 37107 ' },
          { id: 'punctuated', countyFips: '37-107' },
          { id: 'los-angeles', countyFips: '06037' },
        ],
        fips,
      ),
      ['canonical', 'spaced', 'punctuated'],
    );
  });

  it('does not pull Lenoir sources for a county the pull cannot run', () => {
    assert.deepEqual(seedIdsForMarket(['99999']), []);
    assert.deepEqual(
      sourceIdsMatchingFips([{ id: 'lenoir', countyFips: '37107' }], researchCountyFips(['99999'])),
      [],
    );
  });

  it('includes a historical ingest FIPS recorded on the county pull', () => {
    const fips = researchCountyFips(['37107', '37107 ']);
    assert.equal(fips.includes('37107'), true);
    assert.deepEqual(
      sourceIdsMatchingFips([{ id: 'from-run', countyFips: '37107' }], fips),
      ['from-run'],
    );
  });
});

describe('research status copy', () => {
  it('does not report zero sources when the load failed', () => {
    const message = researchCountMessage({
      loading: false,
      countsKnown: false,
      loadError: 'ResearchRun table is missing',
      sourceCount: 0,
      withWebsite: 0,
    });
    assert.equal(message.includes('0 of 0'), false);
    assert.equal(message.includes('ResearchRun table is missing'), true);
  });

  it('explains an empty market and a market with no websites', () => {
    const empty = researchCountMessage({
      loading: false,
      countsKnown: true,
      loadError: null,
      sourceCount: 0,
      withWebsite: 0,
    });
    assert.equal(empty.includes('0 of 0'), false);
    assert.equal(empty.includes('Pull referral sources'), true);

    const noSites = researchCountMessage({
      loading: false,
      countsKnown: true,
      loadError: null,
      sourceCount: 81,
      withWebsite: 0,
    });
    assert.equal(noSites.includes('81'), true);
    assert.equal(noSites.includes('Enrich with Google Places'), true);
  });

  it('keeps the website count when sources were found', () => {
    assert.equal(
      researchCountMessage({
        loading: false,
        countsKnown: true,
        loadError: null,
        sourceCount: 81,
        withWebsite: 73,
      }),
      '73 of 81 referral sources have a public website. Sources without one are skipped.',
    );
  });
});
