import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LENOIR_NC, countyMarketForFips, getCounty, zipListForFips } from './counties';

describe('any county from the ZCTA crosswalk', () => {
  it('reproduces the hand-checked Lenoir ZIP list from the Census file', () => {
    const fromCrosswalk = zipListForFips('37107');
    assert.ok(fromCrosswalk);
    assert.deepEqual(
      fromCrosswalk.map((row) => row.zip).sort(),
      LENOIR_NC.zips.map((row) => row.zip).sort(),
    );
    // 28526 (Dover) and 28580 (Snow Hill) sit almost entirely in other counties.
    assert.equal(fromCrosswalk.some((row) => row.zip === '28526' || row.zip === '28580'), false);
    const core = fromCrosswalk.filter((row) => row.role === 'core').map((row) => row.zip).sort();
    assert.deepEqual(core, ['28504', '28525']);
  });

  it('still uses the hand-checked list for Lenoir', () => {
    assert.equal(countyMarketForFips('37107')?.id, 'lenoir-nc');
    assert.equal(getCounty('37107').zips[0].city, 'Kinston');
  });

  it('builds a pullable county for any other FIPS', () => {
    const wake = getCounty('37183');
    assert.equal(wake.name, 'Wake County');
    assert.equal(wake.state, 'NC');
    assert.equal(wake.id, '37183');
    assert.ok(wake.zips.length > 20, `Wake has ${wake.zips.length} ZIPs`);
    const greene = getCounty('37079');
    assert.ok(greene.zips.some((row) => row.zip === '28580'), 'Snow Hill belongs to Greene');
  });

  it('rejects ids that are neither curated nor a county FIPS', () => {
    assert.throws(() => getCounty('nowhere-xx'));
    assert.throws(() => getCounty('99999'));
    assert.equal(countyMarketForFips('99999'), null);
  });
});
