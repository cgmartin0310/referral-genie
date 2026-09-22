import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPractices, type PracticeSourceRow } from './build';

function row(overrides: Partial<PracticeSourceRow> & { id: string }): PracticeSourceRow {
  return {
    npiNumber: `npi-${overrides.id}`,
    name: `Provider ${overrides.id}`,
    enumerationType: 'NPI-1',
    primaryTaxonomyCode: '208000000X',
    taxonomyCodes: ['208000000X'],
    sourceType: 'pediatrics',
    address: '100 King St',
    city: 'Kinston',
    state: 'NC',
    zipCode: '28501',
    countyName: 'Lenoir',
    countyFips: '37107',
    contactPhone: '252-555-0100',
    faxNumber: '252-555-0190',
    placeId: null,
    ...overrides,
  };
}

describe('practice formation', () => {
  it('nests providers at one address under one practice', () => {
    const practices = buildPractices([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].providerCount, 3);
    assert.equal(practices[0].providers.length, 3);
    assert.equal(practices[0].faxNumber, '252-555-0190');
  });

  it('forms a practice with no org NPI at all', () => {
    // 17 of 22 Lenoir clusters have no NPI-2. This is the common case.
    const practices = buildPractices([row({ id: 'a' }), row({ id: 'b' })]);
    assert.equal(practices.length, 1);
    assert.deepEqual(practices[0].orgNpis, []);
    assert.equal(practices[0].providerCount, 2);
    assert.equal(practices[0].nameAmbiguous, false);
  });

  it('names the practice from a single org NPI and excludes it from the count', () => {
    const practices = buildPractices([
      row({ id: 'a' }),
      row({ id: 'b' }),
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Kinston Pediatrics PA', npiNumber: '1679576722' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'Kinston Pediatrics PA');
    assert.deepEqual(practices[0].orgNpis, ['1679576722']);
    // An organization is not a provider.
    assert.equal(practices[0].providerCount, 2);
  });

  it('picks the org whose fax matches when an address hosts two orgs', () => {
    // 744 Airport Rd holds both Eastern Carolina Physicians and Physicians East.
    const practices = buildPractices([
      row({ id: 'a', faxNumber: '252-555-0190' }),
      row({ id: 'o1', enumerationType: 'NPI-2', name: 'Zeta Physicians PA', npiNumber: '1', faxNumber: '252-555-0999' }),
      row({ id: 'o2', enumerationType: 'NPI-2', name: 'Alpha Physicians PA', npiNumber: '2', faxNumber: '252-555-0190' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'Alpha Physicians PA');
    assert.equal(practices[0].nameAmbiguous, true);
    assert.equal(practices[0].orgNpis.length, 2);
  });

  it('counts the taxonomy mix that drives the estimate', () => {
    const practices = buildPractices([
      row({ id: 'a', sourceType: 'pediatrics' }),
      row({ id: 'b', sourceType: 'pediatrics' }),
      row({ id: 'c', sourceType: 'pcp_family_medicine' }),
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Some Group', npiNumber: '9' }),
    ]);
    assert.deepEqual(practices[0].taxonomyMix, { pediatrics: 2, pcp_family_medicine: 1 });
    assert.equal(practices[0].providerCount, 3);
  });

  it('keeps an org-only location as a practice with no providers', () => {
    // Abode Care Partners appears with no NPI-1 in the pull. Zero providers is
    // an unknown count, not an estimate of zero.
    const practices = buildPractices([
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Abode Care Partners', npiNumber: '5', address: '907 Cunningham Rd' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].providerCount, 0);
    assert.equal(practices[0].name, 'Abode Care Partners');
  });

  it('separates different suites at one street address', () => {
    const practices = buildPractices([
      row({ id: 'a', address: '100 King St Ste 200', contactPhone: '252-555-0100' }),
      row({ id: 'b', address: '100 King Street, Suite 200', contactPhone: '252-555-0100' }),
      row({ id: 'c', address: '100 King St Ste 300', contactPhone: '252-555-0200' }),
    ]);
    assert.equal(practices.length, 2);
    const bySize = practices.sort((left, right) => right.providerCount - left.providerCount);
    assert.equal(bySize[0].providerCount, 2);
    assert.equal(bySize[1].providerCount, 1);
  });

  it('keeps one office together across its street ZIP and its PO Box ZIP', () => {
    // Kinston Pediatric Associates: some providers registered under 28501, the org under 28502.
    const practices = buildPractices([
      row({ id: 'a', address: '2509 N Queen St', zipCode: '28501', city: 'Kinston' }),
      row({ id: 'b', address: '2509 North Queen St', zipCode: '28502', city: 'KINSTON' }),
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Kinston Pediatric Associates PA', npiNumber: '1871577197', address: '2509 North Queen St', zipCode: '28502', city: 'Kinston' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'Kinston Pediatric Associates PA');
    assert.equal(practices[0].providerCount, 2);
  });

  it('uses a place id to join addresses a person typed differently', () => {
    const practices = buildPractices([
      row({ id: 'a', address: '100 Airport Rd', placeId: 'ChIJlenoir' }),
      row({ id: 'b', address: '100 Airport Rd, Lenoir Memorial Hospital', placeId: 'ChIJlenoir' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].placeId, 'ChIJlenoir');
    assert.equal(practices[0].providerCount, 2);
  });
});
