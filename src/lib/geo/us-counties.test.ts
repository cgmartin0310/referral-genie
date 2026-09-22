import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countiesInState, getUsCounty, listStateOptions, normalizeCountyFips, seedCountyIdForFips } from './us-counties';
import { resolveMarketFips } from './market';

describe('US county catalog', () => {
  it('includes Lenoir County, NC and any other county such as Los Angeles', () => {
    const lenoir = getUsCounty('37107');
    assert.equal(lenoir?.name, 'Lenoir County');
    assert.equal(lenoir?.state, 'NC');

    const losAngeles = countiesInState('CA').find((county) => county.name === 'Los Angeles County');
    assert.equal(losAngeles?.fips, '06037');
    assert.ok(countiesInState('TX').length > 200);
    assert.equal(getUsCounty('11001')?.name, 'District of Columbia');
    assert.equal(countiesInState('CT').some((county) => county.name === 'Hartford County'), true);
    assert.equal(countiesInState('VA').some((county) => county.name === 'Richmond city'), true);
  });

  it('marks a hand-checked county by its id and any other county by its FIPS', () => {
    assert.equal(seedCountyIdForFips('37107'), 'lenoir-nc');
    assert.equal(seedCountyIdForFips(' 37-107 '), 'lenoir-nc');
    assert.equal(normalizeCountyFips('37107 '), '37107');
    // Any county with ZIPs in the Census crosswalk is pullable by FIPS.
    assert.equal(seedCountyIdForFips('06037'), '06037');
    assert.equal(seedCountyIdForFips('99999'), null);
    assert.equal(seedCountyIdForFips('lenoir-nc'), null);
  });

  it('lists North Carolina by name', () => {
    const northCarolina = listStateOptions().find((state) => state.code === 'NC');
    assert.equal(northCarolina?.name, 'North Carolina');
  });

  it('rejects unknown and oversized county lists', () => {
    const saved = resolveMarketFips(['37107', '06037', '37107']);
    assert.ok('counties' in saved);
    if (!('counties' in saved)) return;
    assert.deepEqual(saved.counties.map((county) => county.fips), ['37107', '06037']);

    assert.deepEqual(resolveMarketFips(['99999']), { error: 'Unknown county FIPS 99999.' });
    assert.equal('error' in resolveMarketFips(['12']), true);
    assert.equal('error' in resolveMarketFips(Array.from({ length: 41 }, () => '37107')), true);
  });
});