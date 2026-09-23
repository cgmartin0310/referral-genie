import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attachSources, foldListings, type AttachPlace } from './attach';

function place(overrides: Partial<AttachPlace> & { placeId: string; name: string }): AttachPlace {
  return {
    address: '101 S Carey St',
    city: 'La Grange',
    zipCode: '28551',
    phone: '(252) 566-4021',
    website: null,
    reviewCount: null,
    personal: false,
    ...overrides,
  };
}

// What Google returns for the ECU Health clinic in La Grange: the clinic, the
// building's old name, a sister clinic on the same line, and a physician.
const LA_GRANGE = [
  place({ placeId: 'haynes', name: 'Carl L Haynes Jr., MD', personal: true, reviewCount: 3, website: 'https://locations.ecuhealth.org/details/44' }),
  place({ placeId: 'building', name: 'La Grange Medical Center', reviewCount: 11, website: 'http://lagrangenc.com/' }),
  place({ placeId: 'heart', name: 'ECU Health Heart & Vascular Care - La Grange' }),
  place({ placeId: 'clinic', name: 'ECU Health Family Medicine - La Grange', reviewCount: 113, website: 'https://locations.ecuhealth.org/details/44' }),
];

describe('folding Google listings into practices', () => {
  it('merges listings that share a phone at one site into the one people review', () => {
    const fold = foldListings(LA_GRANGE);
    for (const id of ['haynes', 'building', 'heart', 'clinic']) assert.equal(fold.get(id), 'clinic');
  });

  it('folds clinicians into a practice named "..., PA"', () => {
    const at = { address: '744 Airport Rd', city: 'Kinston', zipCode: '28504', phone: '(252) 523-0026' };
    const fold = foldListings([
      place({ placeId: 'pe', name: 'Physicians East, PA - Kinston', reviewCount: 146, ...at }),
      place({ placeId: 'wade', name: 'Dana Wade, FNP-C', personal: true, reviewCount: 20, ...at }),
      place({ placeId: 'westbrook', name: 'Christie Westbrook, PA-C', personal: true, reviewCount: 8, ...at }),
    ]);
    assert.equal(fold.get('wade'), 'pe');
    assert.equal(fold.get('westbrook'), 'pe');
  });

  it('keeps different suites apart even on one phone', () => {
    const fold = foldListings([
      place({ placeId: 'n', name: 'ECU Health Multispecialty Clinic', address: '701 Doctors Dr # N', city: 'Kinston', zipCode: '28501', phone: '252-559-2200', reviewCount: 565 }),
      place({ placeId: 'e1', name: 'UNC Health Complete Care', address: '701 Doctors Dr e1', city: 'Kinston', zipCode: '28501', phone: '252-559-2200', reviewCount: 14 }),
    ]);
    assert.equal(fold.get('e1'), 'e1');
  });
});

describe('attaching NPI records to listings', () => {
  it('puts both La Grange physicians under the family medicine clinic', () => {
    const attached = attachSources(
      [
        { id: 'haynes', name: 'CARL HAYNES', address: '101 S CAREY ST', city: 'LA GRANGE', zipCode: '28551', phone: '2525664021' },
        { id: 'patel', name: 'ATIT PATEL', address: '101 S CAREY ST', city: 'LA GRANGE', zipCode: '28551', phone: '2525664021' },
      ],
      LA_GRANGE,
    );
    assert.equal(attached.get('haynes'), 'clinic');
    assert.equal(attached.get('patel'), 'clinic');
  });

  it('does not follow a shared phone to a different suite', () => {
    // UNC's record at Suite E1 carries the Suite N phone.
    const attached = attachSources(
      [{ id: 'unc', name: 'UNIVERSITY OF NORTH CAROLINA HOSPITALS', address: '701 DOCTORS DR STE E1', city: 'KINSTON', zipCode: '28501', phone: '(252) 559-2200' }],
      [
        place({ placeId: 'n', name: 'ECU Health Multispecialty Clinic', address: '701 Doctors Dr # N', city: 'Kinston', zipCode: '28501', phone: '252-559-2200', reviewCount: 565 }),
        place({ placeId: 'e1', name: 'UNC Health Complete Care', address: '701 Doctors Dr e1', city: 'Kinston', zipCode: '28501', phone: '252-775-5930', reviewCount: 14 }),
      ],
    );
    assert.equal(attached.get('unc'), 'e1');
  });

  it('attaches a floor to the listing for the building when no listing names a floor', () => {
    const attached = attachSources(
      [{ id: 'm', name: 'KATRINA MEACHEM', address: '100 Airport Rd Fl 4', city: 'Kinston', zipCode: '28501', phone: '252-522-7197' }],
      [place({ placeId: 'hospital', name: 'UNC Health Lenoir', address: '100 Airport Rd', city: 'Kinston', zipCode: '28501', phone: '252-522-7000', reviewCount: 208 })],
    );
    assert.equal(attached.get('m'), 'hospital');
  });

  it('follows a physician to their own listing when their NPI address is old', () => {
    const attached = attachSources(
      [{ id: 's', name: 'LORI SCOTT', address: '400 GLENWOOD AVE STE 10', city: 'KINSTON', zipCode: '28501', phone: '9195815882' }],
      [
        place({ placeId: 'own', name: 'Lori Scott Family Care: Lori Scott, MD', personal: true, address: '108 W Capitola Ave', city: 'Kinston', zipCode: '28501', phone: '252-513-1749', reviewCount: 18 }),
        place({ placeId: 'watford', name: 'Watford Family Medicine', address: '400 Glenwood Ave', city: 'Kinston', zipCode: '28501', phone: '252-527-8906' }),
      ],
    );
    assert.equal(attached.get('s'), 'own');
  });

  it('leaves a record with no listing at its site or phone for its own lookup', () => {
    const attached = attachSources(
      [{ id: 'x', name: 'LORI SCOTT', address: '400 GLENWOOD AVE STE 10', city: 'KINSTON', zipCode: '28501', phone: '9195815882' }],
      LA_GRANGE,
    );
    assert.equal(attached.has('x'), false);
  });
});
