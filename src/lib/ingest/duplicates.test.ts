import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignDuplicateClusters } from './duplicates';
import { buildNppesUpsert, buildPlacesWrite } from './source-write';
import { LENOIR_NC } from '../nppes/counties';
import type { KeptProvider } from '../nppes/types';

describe('practice clusters', () => {
  it('merges on place id and on a differently spelled street', () => {
    const assignments = assignDuplicateClusters([
      { id: 'a', phone: '(252) 555-0100', placeId: 'place-1', address: '100 King St', zipCode: '28501' },
      { id: 'c', phone: '252-555-0199', placeId: 'place-1', address: '9 Elsewhere Rd', zipCode: '28501' },
      { id: 'e', phone: '252-555-0177', placeId: null, address: '100 King Street', zipCode: '28501' },
      { id: 'd', phone: '919-555-0108', placeId: null, address: '50 Oak St', zipCode: '28551' },
    ]);
    const byId = new Map(assignments.map((row) => [row.id, row]));
    // place id wins over a different street
    assert.equal(byId.get('a')?.duplicateClusterKey, byId.get('c')?.duplicateClusterKey);
    // "100 King St" and "100 King Street" are one practice
    assert.equal(byId.get('a')?.duplicateClusterKey, byId.get('e')?.duplicateClusterKey);
    assert.equal(byId.get('d')?.likelyDuplicate, false);
    assert.equal(assignments.length, 4);
  });

  it('keeps different suites at one street address apart', () => {
    const assignments = assignDuplicateClusters([
      { id: 'peds', phone: null, placeId: null, address: '100 King St Suite 200', zipCode: '28501' },
      { id: 'peds2', phone: null, placeId: null, address: '100 King Street, Ste 200', zipCode: '28501' },
      { id: 'ortho', phone: null, placeId: null, address: '100 King St #300', zipCode: '28501' },
      { id: 'nosuite', phone: null, placeId: null, address: '100 King St', zipCode: '28501' },
    ]);
    const byId = new Map(assignments.map((row) => [row.id, row]));
    assert.equal(byId.get('peds')?.duplicateClusterKey, byId.get('peds2')?.duplicateClusterKey);
    assert.notEqual(byId.get('peds')?.duplicateClusterKey, byId.get('ortho')?.duplicateClusterKey);
    assert.equal(byId.get('ortho')?.likelyDuplicate, false);
    // A row with no suite is not assumed to be in either one.
    assert.equal(byId.get('nosuite')?.likelyDuplicate, false);
  });

  it('rejoins one campus written with and without a floor', () => {
    // Lenoir Memorial: NPPES holds these three spellings of one street address.
    const assignments = assignDuplicateClusters([
      { id: 'a', phone: '252-522-7000', placeId: null, address: '100 Airport Rd', zipCode: '28501' },
      { id: 'b', phone: '2525227000', placeId: null, address: '100 Airport Rd Fl 4', zipCode: '28501' },
      { id: 'c', phone: '(252) 522-7000', placeId: null, address: '100 Airport Rd, Lenoir Memorial Hospital', zipCode: '28501' },
    ]);
    const byId = new Map(assignments.map((row) => [row.id, row]));
    // The floor variant rejoins: same street, same phone.
    assert.equal(byId.get('a')?.duplicateClusterKey, byId.get('b')?.duplicateClusterKey);
    assert.equal(byId.get('a')?.duplicateClusterKey === null, false);
    // Known limit: row 'c' buries the facility name in the street line, so its
    // street does not match. Places resolves that case, below.
    assert.notEqual(byId.get('a')?.duplicateClusterKey, byId.get('c')?.duplicateClusterKey);
  });

  it('lets a place id rejoin an address a person typed differently', () => {
    const assignments = assignDuplicateClusters([
      { id: 'a', phone: '252-522-7000', placeId: 'ChIJlenoir', address: '100 Airport Rd', zipCode: '28501' },
      { id: 'c', phone: '(252) 522-7000', placeId: 'ChIJlenoir', address: '100 Airport Rd, Lenoir Memorial Hospital', zipCode: '28501' },
    ]);
    const keys = new Set(assignments.map((row) => row.duplicateClusterKey));
    assert.equal(keys.size, 1);
    assert.equal(assignments[0].duplicateClusterKey?.startsWith('place:'), true);
  });

  it('keeps two suites apart when the phones differ', () => {
    const assignments = assignDuplicateClusters([
      { id: 'peds', phone: '252-555-0100', placeId: null, address: '100 King St Ste 200', zipCode: '28501' },
      { id: 'ortho', phone: '252-555-0200', placeId: null, address: '100 King St Ste 300', zipCode: '28501' },
    ]);
    const byId = new Map(assignments.map((row) => [row.id, row]));
    assert.equal(byId.get('peds')?.likelyDuplicate, false);
    assert.equal(byId.get('ortho')?.likelyDuplicate, false);
  });

  it('does not merge two sites that share one main phone', () => {
    const assignments = assignDuplicateClusters([
      { id: 'main', phone: '(252) 555-0100', placeId: null, address: '100 King St', zipCode: '28501' },
      { id: 'satellite', phone: '2525550100', placeId: null, address: '9 Other St', zipCode: '28504' },
    ]);
    const byId = new Map(assignments.map((row) => [row.id, row]));
    assert.equal(byId.get('main')?.likelyDuplicate, false);
    assert.equal(byId.get('satellite')?.likelyDuplicate, false);
    assert.notEqual(byId.get('main')?.duplicateClusterKey, 'phone:2525550100');
    // The shared number is still reported, just not as identity.
    assert.equal(byId.get('main')?.phoneOnlyMatch, true);
    assert.equal(byId.get('satellite')?.phoneOnlyMatch, true);
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
    fax: '252-555-0190',
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
  });

  it('writes an NPPES fax and never clears one that is absent', () => {
    const withFax = buildNppesUpsert(kept, LENOIR_NC, 'org_default', null);
    assert.equal(withFax.create.faxNumber, '252-555-0190');
    assert.equal(withFax.update.faxNumber, '252-555-0190');

    // NPPES lists no fax for roughly half of practice locations. Those upserts
    // must leave the column alone so a researched fax survives a re-pull.
    const withoutFax = buildNppesUpsert({ ...kept, fax: '' }, LENOIR_NC, 'org_default', null);
    assert.equal('faxNumber' in withoutFax.create, false);
    assert.equal('faxNumber' in withoutFax.update, false);
  });

  it('leaves an edited fax alone on a re-pull', () => {
    const { update } = buildNppesUpsert(kept, LENOIR_NC, 'org_default', {
      origin: 'user',
      confidence: null,
      overriddenBy: 'casey',
      overriddenAt: '2026-09-21T00:00:00.000Z',
      overriddenFields: ['faxNumber'],
    });
    assert.equal(update.faxNumber, undefined);
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
