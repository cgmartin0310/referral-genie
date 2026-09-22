import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CityCountyMap, countyForZcta, zip5 } from './county-map';

describe('practice ZIP to county', () => {
  it('maps a street ZIP to the county holding most of it', () => {
    assert.equal(countyForZcta('28504')?.fips, '37107'); // Kinston → Lenoir
    assert.equal(countyForZcta('28530')?.fips, '37147'); // Grifton is mostly Pitt
    assert.equal(countyForZcta('28502'), null); // PO Box ZIP, not a ZCTA
  });

  it('reads a 5-digit ZIP out of a 9-digit postal code', () => {
    assert.equal(zip5('285011234'), '28501');
    assert.equal(zip5('28501-1234'), '28501');
    assert.equal(zip5(''), null);
  });

  it('resolves a PO Box ZIP through the city the street ZIPs already placed', () => {
    const map = new CityCountyMap();
    map.learn('NC', 'KINSTON', '37107');
    map.learn('NC', 'Kinston', '37107');
    map.learn('NC', 'KINSTON', '37147'); // one stray row does not win
    assert.equal(map.resolve('nc', 'kinston '), '37107');
    assert.equal(map.resolve('NC', 'NOWHERE'), null);
    assert.equal(map.resolve('', 'KINSTON'), null);
  });
});
