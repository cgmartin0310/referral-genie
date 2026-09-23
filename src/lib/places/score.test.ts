import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchPractice } from './match';
import { evaluatePlaceMatch, looksLikePersonListing, type PlaceCandidate } from './score';

const practice = {
  name: 'Jane Doe',
  street: '100 King St',
  city: 'Kinston',
  state: 'NC',
  zip: '28501',
  phone: '(252) 555-0100',
};

const place: PlaceCandidate = {
  placeId: 'ChIJlenoir',
  name: 'Jane Doe MD',
  formattedAddress: '100 King St, Kinston, NC 28501, USA',
};

describe('Places match scoring', () => {
  it('accepts a phone match that shares the street number', () => {
    const result = evaluatePlaceMatch(practice, place, { phoneQuery: true });
    assert.equal(result.accept, true);
    assert.ok(result.confidence >= 0.9);
  });

  it('rejects a name-only candidate', () => {
    const result = evaluatePlaceMatch(
      practice,
      { ...place, formattedAddress: '1 Other Rd, Raleigh, NC 27601, USA' },
      { phoneQuery: false },
    );
    assert.equal(result.accept, false);
  });

  it('accepts address plus name without using the phone query', () => {
    const result = evaluatePlaceMatch(practice, place, { phoneQuery: false });
    assert.equal(result.accept, true);
    assert.equal(result.confidence, 0.8);
  });

  it('tells a listing in a person\'s name from the clinic\'s', () => {
    assert.equal(looksLikePersonListing('Carl L Haynes Jr., MD', ['CARL HAYNES']), true);
    assert.equal(looksLikePersonListing('Dr. Ambrose S. Okonkwo', ['AMBROSE OKONKWO']), true);
    assert.equal(looksLikePersonListing('Haynes Family Practice', ['CARL HAYNES']), false);
    assert.equal(looksLikePersonListing('ECU Health Family Medicine - La Grange', ['CARL HAYNES', 'ATIT PATEL']), false);
    assert.equal(looksLikePersonListing('Kinston Pediatric Associates', []), false);
  });

  it('prefers the clinic listing over one in the physician\'s own name at the same phone', async () => {
    const clinic: PlaceCandidate = {
      placeId: 'ChIJclinic',
      name: 'ECU Health Family Medicine - La Grange',
      formattedAddress: '101 S Carey St, La Grange, NC 28551, USA',
    };
    const own: PlaceCandidate = {
      placeId: 'ChIJhaynes',
      name: 'Carl L Haynes Jr., MD',
      formattedAddress: '101 S Carey St, La Grange, NC 28551, USA',
    };
    const details = (name: string) => ({
      phone: '(252) 566-4021', website: null, rating: null, reviewCount: null, businessStatus: 'OPERATIONAL',
      latitude: null, longitude: null, name, formattedAddress: clinic.formattedAddress,
    });
    const query = { name: 'CARL HAYNES', street: '101 S CAREY ST', city: 'LA GRANGE', state: 'NC', zip: '28551', phone: '2525664021', isPerson: true };
    // Google's order puts the physician first; the clinic still wins.
    const match = await matchPractice(query, {
      async findPlace() { return [own, clinic]; },
      async placeDetails(placeId) { return details(placeId === 'ChIJclinic' ? clinic.name : own.name); },
    });
    assert.equal(match?.placeId, 'ChIJclinic');
    // An organization query keeps plain confidence order.
    const org = await matchPractice({ ...query, name: 'Haynes Medical PA', isPerson: false }, {
      async findPlace() { return [own, clinic]; },
      async placeDetails(placeId) { return details(placeId === 'ChIJclinic' ? clinic.name : own.name); },
    });
    assert.equal(org?.placeId, 'ChIJhaynes');
  });

  it('uses the injected client and does not merge two NPIs', async () => {
    const calls: string[] = [];
    const match = await matchPractice(practice, {
      async findPlace(text, inputtype) {
        calls.push(inputtype);
        if (inputtype === 'phonenumber') return [place];
        return [];
      },
      async placeDetails() {
        return {
          phone: '(252) 555-0100',
          website: 'https://example.test',
          rating: 4.6,
          reviewCount: 12,
          businessStatus: 'OPERATIONAL',
          latitude: 35.26,
          longitude: -77.58,
          name: place.name,
          formattedAddress: place.formattedAddress,
        };
      },
    });
    assert.equal(calls[0], 'phonenumber');
    assert.equal(match?.placeId, 'ChIJlenoir');
    assert.equal(match?.reviewCount, 12);
    assert.equal(match?.businessStatus, 'OPERATIONAL');
    assert.equal(match?.website, 'https://example.test');
  });
});
