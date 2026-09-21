import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchPractice } from './match';
import { evaluatePlaceMatch, type PlaceCandidate } from './score';

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
