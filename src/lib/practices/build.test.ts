import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPractices, type PlaceRow, type PracticeSourceRow } from './build';

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

function listing(overrides: Partial<PlaceRow> & { placeId: string; name: string }): PlaceRow {
  return {
    address: '100 King St',
    city: 'Kinston',
    state: 'NC',
    zipCode: '28501',
    countyName: 'Lenoir',
    countyFips: '37107',
    phone: '252-555-0100',
    website: null,
    rating: null,
    reviewCount: null,
    personal: false,
    ...overrides,
  };
}

// The ECU Health clinic in La Grange: no organization NPI there, and Google
// lists the clinic, the building's old name, and a physician's own listing.
const LA_GRANGE_ROWS = [
  row({ id: 'haynes', name: 'CARL HAYNES', sourceType: 'pcp_family_medicine', address: '101 S CAREY ST', city: 'LA GRANGE', zipCode: '28551', contactPhone: '2525664021', faxNumber: '2525662902' }),
  row({ id: 'patel', name: 'ATIT PATEL', sourceType: 'pcp_family_medicine', address: '101 S CAREY ST', city: 'LA GRANGE', zipCode: '28551', contactPhone: '2525664021', faxNumber: null }),
];
const at = { address: '101 S Carey St', city: 'La Grange', zipCode: '28551', phone: '(252) 566-4021' };
const LA_GRANGE_LISTINGS = [
  listing({ placeId: 'own', name: 'Carl L Haynes Jr., MD', personal: true, reviewCount: 3, website: 'https://locations.ecuhealth.org/details/44', ...at }),
  listing({ placeId: 'building', name: 'La Grange Medical Center', reviewCount: 11, website: 'http://lagrangenc.com/', ...at }),
  listing({ placeId: 'clinic', name: 'ECU Health Family Medicine - La Grange', reviewCount: 113, website: 'https://locations.ecuhealth.org/details/44', ...at }),
];

describe('practice formation, NPI first', () => {
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
  it('does not make a row from an organization record with no provider', () => {
    // A rural health clinic code is on urgent cares and health departments too.
    const practices = buildPractices([
      row({ id: 'org', enumerationType: 'NPI-2', name: 'Fast Pace Kentucky PLLC', npiNumber: '5', address: '700 Plaza Blvd' }),
    ]);
    assert.equal(practices.length, 0);
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

  it('groups providers at one address with no organization, named by their Google listing', () => {
    const practices = buildPractices(LA_GRANGE_ROWS, LA_GRANGE_LISTINGS);
    assert.equal(practices.length, 1);
    const [clinic] = practices;
    assert.equal(clinic.name, 'ECU Health Family Medicine - La Grange');
    assert.equal(clinic.formedBy, 'listing');
    assert.equal(clinic.providerCount, 2);
    // The group's NPI fax: one provider's registration covers the other.
    assert.equal(clinic.faxNumber, '2525662902');
    assert.equal(clinic.website, 'https://locations.ecuhealth.org/details/44');
    assert.equal(clinic.reviewCount, 113);
  });

  it('never names a group after its street when Google has nothing', () => {
    const practices = buildPractices(LA_GRANGE_ROWS, []);
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'CARL HAYNES and 1 other');
    assert.equal(practices[0].formedBy, 'provider');
  });

  it('names a provider alone by their practice listing and keeps them keyed by NPI', () => {
    const practices = buildPractices(
      [row({ id: 'o', name: 'AMBROSE OKONKWO', npiNumber: '111', address: '2104 N Herritage St' })],
      [listing({ placeId: 'hope', name: 'Hope Physicians and Urgent Care', address: '2104 N Herritage St' })],
    );
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'Hope Physicians and Urgent Care');
    assert.equal(practices[0].practiceKey, 'npi:111');
    assert.equal(practices[0].providerCount, 1);
  });

  it('lists a provider alone under their own name when Google has nothing', () => {
    const practices = buildPractices([row({ id: 'm', name: 'PATRICIA MCCARRON' })], []);
    assert.equal(practices[0].name, 'PATRICIA MCCARRON');
    assert.equal(practices[0].formedBy, 'provider');
  });

  it('follows a physician to their own listing when their NPI address is old', () => {
    const practices = buildPractices(
      [row({ id: 's', name: 'LORI SCOTT', address: '400 GLENWOOD AVE STE 10', contactPhone: '9195815882' })],
      [listing({ placeId: 'own', name: 'Lori Scott Family Care: Lori Scott, MD', personal: true, address: '108 W Capitola Ave', phone: '252-513-1749' })],
    );
    assert.equal(practices[0].name, 'Lori Scott Family Care: Lori Scott, MD');
    assert.equal(practices[0].address, '108 W Capitola Ave');
  });

  it('keeps the organization name and records the listing beside it', () => {
    const practices = buildPractices(
      [
        row({ id: 'a' }),
        row({ id: 'org', enumerationType: 'NPI-2', name: 'Kinston Pediatric Associates PA', npiNumber: '1871577197' }),
      ],
      [listing({ placeId: 'kpa', name: 'Kinston Pediatric Associates', reviewCount: 40 })],
    );
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'Kinston Pediatric Associates PA');
    assert.equal(practices[0].formedBy, 'organization');
    assert.equal(practices[0].placeName, 'Kinston Pediatric Associates');
    assert.equal(practices[0].practiceKey, 'org:1871577197');
  });

  it('uses Google\'s name where the organization is a health system registered at several sites', () => {
    const practices = buildPractices(
      [
        row({ id: 'a', address: '109 Airport Rd Ste A', contactPhone: '252-643-7575' }),
        row({ id: 'o1', enumerationType: 'NPI-2', name: 'University of North Carolina Hospitals', npiNumber: '1', address: '109 Airport Rd Ste A', contactPhone: '252-643-7575' }),
        row({ id: 'o2', enumerationType: 'NPI-2', name: 'University of North Carolina Hospitals', npiNumber: '2', address: '7868 US Hwy 70 W', city: 'La Grange', zipCode: '28551', contactPhone: '252-775-5910' }),
      ],
      [listing({ placeId: 'unc', name: 'UNC Health Complete Care', address: '109 Airport Rd A', phone: '(252) 643-7575' })],
    );
    assert.equal(practices.length, 1);
    assert.equal(practices[0].name, 'UNC Health Complete Care');
  });

  it('does not let one member\'s own listing next door move the group', () => {
    const practices = buildPractices(
      [
        row({ id: 'r', name: 'ALLEEN RICHARDS', address: '109 Airport Rd Ste A', contactPhone: '252-643-7575' }),
        row({ id: 'n', name: 'MICHELLE NZUNA', address: '109 Airport Rd Ste A', contactPhone: '252-643-7575' }),
        row({ id: 'lfm', name: 'LADDIE CRISP', address: '107 Airport Rd', contactPhone: '252-527-4146' }),
        row({ id: 'org', enumerationType: 'NPI-2', name: 'Lenoir Family Medicine, PA', npiNumber: '5', address: '107 Airport Rd', contactPhone: '252-527-4146' }),
      ],
      [
        listing({ placeId: 'unc', name: 'UNC Health Complete Care', address: '109 Airport Rd A', phone: '(252) 643-7575' }),
        listing({ placeId: 'lfm', name: 'Lenoir Family Medicine', address: '107 Airport Rd', phone: '(252) 527-4146', reviewCount: 14 }),
        listing({ placeId: 'richards', name: 'Alleen D. Richards, MD', personal: true, address: '107 Airport Rd', phone: '(252) 527-4146' }),
      ],
    );
    assert.equal(practices.length, 2);
    assert.equal(practices.find((p) => p.name === 'UNC Health Complete Care')?.providerCount, 2);
  });

  it('does not name a row after another clinician\'s own listing', () => {
    // A hospital physician's direct line reaches only colleagues' listings.
    const practices = buildPractices(
      [row({ id: 'k', name: 'KATRINA MEACHEM', address: '100 Airport Rd Fl 4', contactPhone: '252-522-7197' })],
      [listing({ placeId: 'av', name: 'Anand Vakharia, MD', personal: true, address: '100 Airport Rd', phone: '(252) 522-7197' })],
    );
    assert.equal(practices[0].name, 'KATRINA MEACHEM');
    assert.equal(practices[0].placeId, null);
  });

  it('merges an organization and a provider that Google lists as one practice', () => {
    // The health center's org NPIs give the street; a physician added the suite.
    const practices = buildPractices(
      [
        row({ id: 'org', enumerationType: 'NPI-2', name: 'Kinston Community Health Center, Inc', npiNumber: '9', address: '324 N Queen St', contactPhone: '252-522-9800' }),
        row({ id: 'r', name: 'JENNIFER ROBERSON', address: '324 N Queen St A', contactPhone: '252-522-9800' }),
        row({ id: 'g', name: 'HLOY GREEN', address: '324 N Queen St', contactPhone: '252-522-9800' }),
      ],
      [
        listing({ placeId: 'kh', name: 'Kinston Health (Kinston Community Health Center, Inc)', address: '324 N Queen St', phone: '(252) 522-9800', reviewCount: 70 }),
        listing({ placeId: 'jr', name: 'Dr. Jennifer Roberson, MD', personal: true, address: '324 N Queen St A', phone: '(252) 522-9800' }),
      ],
    );
    assert.equal(practices.length, 1);
    assert.equal(practices[0].providerCount, 2);
    assert.equal(practices[0].name, 'Kinston Community Health Center, Inc');
  });
});
