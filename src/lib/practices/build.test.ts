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
  it('nests providers at one address under its organization', () => {
    const practices = buildPractices([
      row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' }),
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Kinston Pediatrics PA', npiNumber: '1679576722' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].providerCount, 3);
    assert.equal(practices[0].providers.length, 3);
    assert.equal(practices[0].faxNumber, '252-555-0190');
  });

  it('lists providers individually when their address has no organization NPI', () => {
    // Nothing to group under, so no made-up "100 Airport Rd" practice.
    const practices = buildPractices([row({ id: 'a', name: 'Joan Perry' }), row({ id: 'b', name: 'Orvil Reece' })]);
    assert.equal(practices.length, 2);
    assert.deepEqual(practices.map((p) => p.name).sort(), ['Joan Perry', 'Orvil Reece']);
    assert.ok(practices.every((p) => p.providerCount === 1 && p.orgNpis.length === 0 && p.practiceKey.startsWith('npi:')));
    assert.equal(practices[0].faxNumber, '252-555-0190');
  });

  it('groups providers under the Google listing they share when no organization NPI is registered there', () => {
    // ECU Health registers one NPI-2 in Greenville and none at its La Grange
    // clinic; Google lists the clinic, and both physicians match it.
    const practices = buildPractices([
      row({ id: 'a', name: 'Carl Haynes', address: '101 S Carey St', city: 'La Grange', zipCode: '28551', contactPhone: '252-566-4021', faxNumber: '252-566-2902', placeId: 'ChIJecu', placeName: 'ECU Health Family Medicine - La Grange', website: 'https://locations.ecuhealth.org/details/44' }),
      row({ id: 'b', name: 'Atit Patel', address: '101 S CAREY ST', city: 'LA GRANGE', zipCode: '28551', contactPhone: '252-566-4021', faxNumber: null, placeId: 'ChIJecu', placeName: 'ECU Health Family Medicine - La Grange', website: 'https://locations.ecuhealth.org/details/44' }),
    ]);
    assert.equal(practices.length, 1);
    const [clinic] = practices;
    assert.equal(clinic.name, 'ECU Health Family Medicine - La Grange');
    assert.equal(clinic.formedBy, 'listing');
    assert.equal(clinic.practiceKey, 'place:ChIJecu');
    assert.equal(clinic.providerCount, 2);
    assert.deepEqual(clinic.orgNpis, []);
    // One provider's registered fax covers the colleague who left theirs blank.
    assert.equal(clinic.faxNumber, '252-566-2902');
    assert.equal(clinic.website, 'https://locations.ecuhealth.org/details/44');
  });

  it('names the group from the clinic listing, not a member\'s own listing at the same address', () => {
    // Haynes matched his personal Google listing; Patel matched the clinic's.
    const practices = buildPractices([
      row({ id: 'a', name: 'CARL HAYNES', placeId: 'ChIJhaynes', placeName: 'Carl L Haynes Jr., MD' }),
      row({ id: 'b', name: 'ATIT PATEL', placeId: 'ChIJclinic', placeName: 'ECU Health Family Medicine - La Grange' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'ECU Health Family Medicine - La Grange');
    assert.equal(practices[0].providerCount, 2);
  });

  it('does not show a provider their own listing name', () => {
    const practices = buildPractices([
      row({ id: 'a', name: 'AMBROSE OKONKWO', placeId: 'ChIJo', placeName: 'Dr. Ambrose S. Okonkwo, MD' }),
    ]);
    assert.equal(practices[0].placeName, null);
  });

  it('never names a group after its street: providers at one address with no listing stay individual', () => {
    const practices = buildPractices([
      row({ id: 'a', name: 'Joan Perry', faxNumber: '252-555-0190' }),
      row({ id: 'b', name: 'Orvil Reece', faxNumber: null }),
    ]);
    assert.equal(practices.length, 2);
    assert.ok(practices.every((p) => p.formedBy === 'provider'));
    // The blank fax is borrowed from the colleague at the same location.
    assert.equal(practices.find((p) => p.name === 'Orvil Reece')?.faxNumber, '252-555-0190');
  });

  it('carries the listing name on a provider listed alone', () => {
    const practices = buildPractices([
      row({ id: 'a', name: 'Joan Perry', placeId: 'ChIJx', placeName: 'Kinston Family Care' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'Joan Perry');
    assert.equal(practices[0].placeName, 'Kinston Family Care');
  });

  it('lets an organization NPI outrank the listing name', () => {
    const practices = buildPractices([
      row({ id: 'a', placeId: 'ChIJk', placeName: 'Kinston Pediatrics' }),
      row({ id: 'b', placeId: 'ChIJk', placeName: 'Kinston Pediatrics' }),
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Kinston Pediatrics PA', npiNumber: '1679576722', placeId: 'ChIJk', placeName: 'Kinston Pediatrics' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'Kinston Pediatrics PA');
    assert.equal(practices[0].formedBy, 'organization');
    assert.equal(practices[0].placeName, 'Kinston Pediatrics');
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

  it('does not call one health center registered three times ambiguous', () => {
    const practices = buildPractices([
      row({ id: 'a' }),
      row({ id: 'o1', enumerationType: 'NPI-2', name: 'Kinston Community Health Center, Inc', npiNumber: '1' }),
      row({ id: 'o2', enumerationType: 'NPI-2', name: 'KINSTON COMMUNITY HEALTH CENTER, INC.', npiNumber: '2' }),
      row({ id: 'o3', enumerationType: 'NPI-2', name: 'Kinston Community Health Center Inc', npiNumber: '3' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].nameAmbiguous, false);
    assert.equal(practices[0].orgNpis.length, 3);
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
      row({ id: 'o', enumerationType: 'NPI-2', name: 'Suite 200 Peds PA', npiNumber: '7', address: '100 King St Ste 200', contactPhone: '252-555-0100' }),
      row({ id: 'c', address: '100 King St Ste 300', contactPhone: '252-555-0200' }),
    ]);
    assert.equal(practices.length, 2);
    const group = practices.find((p) => p.orgNpis.length > 0);
    assert.equal(group?.providerCount, 2);
    assert.equal(practices.find((p) => p.orgNpis.length === 0)?.providerCount, 1);
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
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Lenoir Memorial Hospital', npiNumber: '4', address: '100 Airport Rd', placeId: 'ChIJlenoir' }),
    ]);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].placeId, 'ChIJlenoir');
    assert.equal(practices[0].providerCount, 2);
  });
});
