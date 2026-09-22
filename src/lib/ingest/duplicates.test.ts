import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignDuplicateClusters } from './duplicates';
import { buildNppesUpsert, buildPlacesWrite } from './source-write';
import { LENOIR_NC } from '../nppes/counties';
import type { KeptProvider } from '../nppes/types';

describe('duplicate clusters', () => {
  it('flags a shared phone and place id without collapsing rows', () => {
    const assignments = assignDuplicateClusters([
      { id: 'a', phone: '(252) 555-0100', placeId: 'place-1', address: '100 King St', zipCode: '28501' },
      { id: 'b', phone: '2525550100', placeId: null, address: '9 Other St', zipCode: '28504' },
      { id: 'c', phone: '252-555-0199', placeId: 'place-1', address: '100 King Street', zipCode: '28501' },
      { id: 'd', phone: '919-555-0108', placeId: null, address: '50 Oak St', zipCode: '28551' },
    ]);
    const byId = new Map(assignments.map((row) => [row.id, row]));
    assert.equal(byId.get('a')?.likelyDuplicate, true);
    assert.equal(byId.get('b')?.likelyDuplicate, true);
    assert.equal(byId.get('c')?.likelyDuplicate, true);
    assert.equal(byId.get('d')?.likelyDuplicate, false);
    assert.equal(byId.get('a')?.duplicateClusterKey, byId.get('c')?.duplicateClusterKey);
    assert.equal(assignments.length, 4);
  });
});

describe('source writes', () => {
  const kept: KeptProvider = {
    npi: '1234567893',
    name: 'Jane Doe',
    enumerationType: 'NPI-1',
    taxonomyCodes: ['208000000X'],
    primaryTaxonomyCode: '208000000X',
    primaryTaxonomyDesc: 'Pediatrics',
    sourceType: 'pediatrics',
    address: '100 King St',
    city: 'Kinston',
    state: 'NC',
    zipCode: '28501',
    phone: '252-555-0100',
    addressFlags: ['boundary_zip'],
    quarantined: false,
  };

  it('upserts by NPI and preserves an edited phone', () => {
    const existing = {
      origin: 'places',
      confidence: 0.86,
      overriddenBy: 'casey',
      overriddenAt: '2026-09-21T00:00:00.000Z',
      overriddenFields: ['contactPhone'],
    };
    const { create, update } = buildNppesUpsert(kept, LENOIR_NC, 'org_default', existing);
    assert.equal(create.npiNumber, '1234567893');
    assert.equal(update.npiNumber, undefined);
    assert.equal(update.contactPhone, undefined);
    assert.equal(update.countyFips, '37107');
    assert.equal(update.primaryTaxonomyCode, '208000000X');
    assert.equal(update.provenance?.origin, 'mixed');
    assert.equal(update.provenance?.overriddenBy, 'casey');
    assert.equal(create.clinicLocationId, undefined);
    assert.equal(update.clinicLocationId, undefined);
  });

  it('stamps clinicLocationId on create and fills null on update', () => {
    const clinicId = 'clinic_kinston';
    const { create, update } = buildNppesUpsert(kept, LENOIR_NC, 'org_default', null, {
      clinicLocationId: clinicId,
      existingClinicLocationId: null,
    });
    assert.equal(create.clinicLocationId, clinicId);
    assert.equal(update.clinicLocationId, clinicId);
  });

  it('does not move a source already linked to another clinic', () => {
    const { create, update } = buildNppesUpsert(kept, LENOIR_NC, 'org_default', null, {
      clinicLocationId: 'clinic_kinston',
      existingClinicLocationId: 'clinic_other',
    });
    assert.equal(create.clinicLocationId, 'clinic_kinston');
    assert.equal(update.clinicLocationId, undefined);
  });

  it('stores a missing NPI as null on create', () => {
    const { create } = buildNppesUpsert({ ...kept, npi: '   ' }, LENOIR_NC, 'org_default', null);
    assert.equal(create.npiNumber, null);
  });

  it('writes Places fields and skips an overridden rating', () => {
    const write = buildPlacesWrite(
      {
        placeId: 'ChIJlenoir',
        confidence: 0.95,
        phone: '(252) 555-0100',
        website: 'https://example.test',
        rating: 4.4,
        reviewCount: 8,
        businessStatus: 'OPERATIONAL',
        latitude: 35.26,
        longitude: -77.58,
        matchedBy: 'phone',
      },
      {
        origin: 'nppes',
        confidence: null,
        overriddenBy: 'casey',
        overriddenAt: '2026-09-21T00:00:00.000Z',
        overriddenFields: ['rating'],
      },
    );
    assert.equal(write.placeId, 'ChIJlenoir');
    assert.equal(write.reviewCount, 8);
    assert.equal(write.businessStatus, 'OPERATIONAL');
    assert.equal(write.rating, undefined);
    assert.equal(write.website, 'https://example.test');
    assert.equal(write.contactPhone, '(252) 555-0100');
    assert.equal(write.placesMatchStatus, 'matched');
    assert.equal(write.provenance?.confidence, 0.95);
  });

  it('persists a Places website and leaves an edited website alone', () => {
    const matched = buildPlacesWrite(
      {
        placeId: 'ChIJlenoir',
        confidence: 0.91,
        phone: null,
        website: 'https://kinston.example/refer',
        rating: null,
        reviewCount: 3,
        businessStatus: 'OPERATIONAL',
        latitude: 35.26,
        longitude: -77.58,
        matchedBy: 'address',
      },
      null,
    );
    assert.equal(matched.website, 'https://kinston.example/refer');
    assert.equal(matched.placesMatchStatus, 'matched');
    assert.equal('website' in matched, true);

    const edited = buildPlacesWrite(
      {
        placeId: 'ChIJlenoir',
        confidence: 0.91,
        phone: null,
        website: 'https://kinston.example/refer',
        rating: null,
        reviewCount: 3,
        businessStatus: 'OPERATIONAL',
        latitude: 35.26,
        longitude: -77.58,
        matchedBy: 'address',
      },
      {
        origin: 'user',
        confidence: null,
        overriddenBy: 'casey',
        overriddenAt: '2026-09-21T00:00:00.000Z',
        overriddenFields: ['website'],
      },
    );
    assert.equal(edited.website, undefined);
    assert.equal(edited.placesMatchStatus, 'matched');

    const noSite = buildPlacesWrite(
      {
        placeId: 'ChIJlenoir',
        confidence: 0.91,
        phone: null,
        website: null,
        rating: null,
        reviewCount: null,
        businessStatus: 'OPERATIONAL',
        latitude: null,
        longitude: null,
        matchedBy: 'address',
      },
      null,
    );
    assert.equal(noSite.website, undefined);
  });
});
