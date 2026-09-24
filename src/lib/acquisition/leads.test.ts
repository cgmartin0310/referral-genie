import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLeads, type LeadRecord } from './leads';

const record = (overrides: Partial<LeadRecord> & { npi: string }): LeadRecord => ({
  name: `THERAPIST ${overrides.npi}`,
  entityType: '1',
  primaryTaxonomyCode: '235Z00000X',
  address1: '100 KING ST',
  city: 'KINSTON',
  zip: '28501',
  phone: '2525550100',
  fax: null,
  ...overrides,
});

describe('clinic-owner leads', () => {
  it('groups therapists under their clinic and counts them by discipline', () => {
    const leads = buildLeads([
      record({ npi: '1', primaryTaxonomyCode: '235Z00000X' }),
      record({ npi: '2', primaryTaxonomyCode: '225XP0200X' }),
      record({ npi: '3', primaryTaxonomyCode: '2251P0200X' }),
      record({ npi: '9', entityType: '2', name: 'BRIGHT STEPS PEDIATRIC THERAPY LLC', primaryTaxonomyCode: '261QP2000X', fax: '2525550199' }),
    ]);
    assert.equal(leads.length, 1);
    assert.equal(leads[0].name, 'Bright Steps Pediatric Therapy Llc');
    assert.deepEqual(leads[0].therapists, { pt: 1, ot: 1, st: 1 });
    assert.equal(leads[0].pediatric, true);
    assert.equal(leads[0].key, 'org:9');
    assert.equal(leads[0].faxNumber, '2525550199');
  });

  it('makes a solo therapist a lead of their own, named after them', () => {
    const leads = buildLeads([record({ npi: '5', name: 'JANE SPEECH', address1: '9 ELM ST' })]);
    assert.equal(leads[0].name, 'Jane Speech');
    assert.equal(leads[0].key, 'npi:5');
  });

  it('never names a group after its street', () => {
    const leads = buildLeads([record({ npi: '1', name: 'ANN LEE' }), record({ npi: '2', name: 'BO KIM' })]);
    assert.equal(leads.length, 1);
    assert.match(leads[0].name, /and 1 other therapist$/);
  });
});
