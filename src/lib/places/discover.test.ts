import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { discoveryTowns, keepDiscovered, namedAsReferralPractice, parseFormattedAddress } from './discover';
import { LENOIR_NC } from '../nppes/counties';

describe('finding practices on Google', () => {
  it('parses a formatted address', () => {
    assert.deepEqual(parseFormattedAddress('101 S Carey St, La Grange, NC 28551, USA'), {
      address: '101 S Carey St', city: 'La Grange', state: 'NC', zip: '28551',
    });
  });

  it('keeps listings the crosswalk places in the county and drops the rest', () => {
    const inCounty = keepDiscovered({ name: 'LaGrange Pediatrics', formattedAddress: '114 E Railroad St, La Grange, NC 28551, USA', types: ['doctor', 'health'] }, '37107');
    const wilmington = keepDiscovered({ name: 'Hanover Pediatrics', formattedAddress: '3505 Converse Rd, Wilmington, NC 28403, USA', types: ['doctor', 'health'] }, '37107');
    const dentist = keepDiscovered({ name: 'Kinston Smiles Family Dental', formattedAddress: '315 Airport Rd, Kinston, NC 28501, USA', types: ['dentist', 'health'] }, '37107');
    assert.equal(inCounty.keep, true);
    assert.equal(wilmington.keep, false);
    assert.equal(dentist.keep, false);
    // A health center with a dental clinic is typed as both, and stays.
    const fqhc = keepDiscovered({ name: 'Kinston Health (Kinston Community Health Center, Inc)', formattedAddress: '324 N Queen St, Kinston, NC 28501, USA', types: ['dentist', 'doctor', 'health', 'hospital'] }, '37107');
    assert.equal(fqhc.keep, true);
  });

  it('searches the county and each town once', () => {
    const towns = discoveryTowns(LENOIR_NC, ['KINSTON', 'LA GRANGE', 'LAGRANGE']);
    assert.equal(towns[0], 'Lenoir County');
    assert.equal(towns.filter((town) => town === 'Kinston').length, 1);
    assert.ok(towns.includes('La Grange'));
  });

  it('tells a referral practice name from a specialty or a dentist', () => {
    assert.equal(namedAsReferralPractice('LaGrange Pediatrics', ['doctor']), true);
    assert.equal(namedAsReferralPractice('Watford Family Medicine', ['health']), true);
    assert.equal(namedAsReferralPractice('Kinston Smiles Family Dental', ['dentist']), false);
    assert.equal(namedAsReferralPractice('UNC Cardiology at Lenoir', ['doctor']), false);
  });
});
