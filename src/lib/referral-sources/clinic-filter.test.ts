import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sourceMatchesClinicFilter } from './clinic-filter';

describe('sourceMatchesClinicFilter', () => {
  const clinicId = 'clinic_kinston';
  const market = ['37107'];

  it('includes sources stamped to the clinic', () => {
    assert.equal(
      sourceMatchesClinicFilter(
        { clinicLocationId: clinicId, countyFips: '37107' },
        clinicId,
        market,
      ),
      true,
    );
  });

  it('includes unassigned market-pulled sources in the clinic counties', () => {
    assert.equal(
      sourceMatchesClinicFilter(
        { clinicLocationId: null, countyFips: '37107' },
        clinicId,
        market,
      ),
      true,
    );
    assert.equal(
      sourceMatchesClinicFilter(
        { clinicLocationId: null, countyFips: '37-107' },
        clinicId,
        market,
      ),
      true,
    );
  });

  it('excludes sources stamped to another clinic', () => {
    assert.equal(
      sourceMatchesClinicFilter(
        { clinicLocationId: 'clinic_other', countyFips: '37107' },
        clinicId,
        market,
      ),
      false,
    );
  });

  it('excludes unassigned sources outside the clinic market', () => {
    assert.equal(
      sourceMatchesClinicFilter(
        { clinicLocationId: null, countyFips: '37051' },
        clinicId,
        market,
      ),
      false,
    );
    assert.equal(
      sourceMatchesClinicFilter(
        { clinicLocationId: null, countyFips: null },
        clinicId,
        market,
      ),
      false,
    );
  });
});
