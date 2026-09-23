import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPersonalListing, listingInCounty, parseFormattedAddress } from './listing';

describe('Google listings', () => {
  it('parses a formatted address', () => {
    assert.deepEqual(parseFormattedAddress('101 S Carey St, La Grange, NC 28551, USA'), {
      address: '101 S Carey St', city: 'La Grange', state: 'NC', zip: '28551',
    });
  });

  it('places a listing in its county by ZIP', () => {
    assert.equal(listingInCounty('114 E Railroad St, La Grange, NC 28551, USA', '37107'), true);
    assert.equal(listingInCounty('3505 Converse Rd, Wilmington, NC 28403, USA', '37107'), false);
  });

  it('tells a clinician\'s own listing from a practice', () => {
    assert.equal(isPersonalListing('Carl L Haynes Jr., MD'), true);
    assert.equal(isPersonalListing('Physicians East, PA - Kinston'), false);
    assert.equal(isPersonalListing('Pranay Kumar Reddy Loka'), true);
    assert.equal(isPersonalListing('Watford Family Medicine'), false);
    assert.equal(isPersonalListing('UNC Health Lenoir'), false);
  });
});
