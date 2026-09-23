import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LENOIR_NC } from './counties';
import { hitFromApiResult } from './api-shape';
import { classifyHit } from './normalize';
import { TAXONOMY_ALLOW_LIST } from './taxonomies';
import type { RawHit } from './types';

function hit(overrides: Partial<RawHit>): RawHit {
  return {
    npi: '1234567893',
    enumerationType: 'NPI-1',
    name: 'JANE DOE',
    status: 'A',
    taxonomies: [{ code: '208000000X', desc: 'Pediatrics', primary: true }],
    locations: [
      {
        address1: '100 KING ST',
        address2: '',
        city: 'KINSTON',
        state: 'NC',
        postalCode: '28501',
        phone: '252-555-0100',
        fax: '252-555-0190',
      },
    ],
    mailing: null,
    ...overrides,
  };
}

describe('Lenoir allow-list', () => {
  it('keeps the nine pediatrician and PCP codes and the Kinston ZIP', () => {
    assert.equal(TAXONOMY_ALLOW_LIST.length, 18);
    assert.equal(LENOIR_NC.fips, '37107');
    assert.ok(LENOIR_NC.zips.some((row) => row.zip === '28501'));
    assert.equal(LENOIR_NC.zips.some((row) => row.zip === '28502'), false);
  });

  it('keeps a primary pediatrician and flags the Kinston boundary ZIP', () => {
    const decision = classifyHit(hit({}), LENOIR_NC);
    assert.equal(decision.action, 'keep');
    if (decision.action !== 'keep') return;
    assert.equal(decision.provider.sourceType, 'pediatrics');
    assert.equal(decision.provider.quarantined, false);
    assert.ok(decision.provider.addressFlags.includes('boundary_zip'));
    assert.equal(decision.provider.name, 'Jane Doe');
  });

  it('drops a dentist and a secondary-only internal medicine code', () => {
    const dentist = classifyHit(
      hit({ taxonomies: [{ code: '1223G0001X', desc: 'Dentist', primary: true }] }),
      LENOIR_NC,
    );
    assert.deepEqual(dentist, { action: 'drop', reason: 'not_allow_list' });

    const secondary = classifyHit(
      hit({
        taxonomies: [
          { code: '207RC0000X', desc: 'Cardiovascular Disease', primary: true },
          { code: '207Q00000X', desc: 'Family Medicine', primary: false },
        ],
      }),
      LENOIR_NC,
    );
    assert.deepEqual(secondary, { action: 'drop', reason: 'secondary_only' });
  });

  it('quarantines a PO Box and a missing phone', () => {
    const poBox = classifyHit(
      hit({
        locations: [
          {
            address1: 'PO BOX 12',
            address2: '',
            city: 'KINSTON',
            state: 'NC',
            postalCode: '28504',
            phone: '252-555-0101',
            fax: '',
          },
        ],
      }),
      LENOIR_NC,
    );
    assert.equal(poBox.action, 'keep');
    if (poBox.action === 'keep') assert.equal(poBox.provider.quarantined, true);

    const parsed = hitFromApiResult({
      number: '1679576722',
      enumeration_type: 'NPI-2',
      basic: { organization_name: 'KINSTON PEDIATRICS', status: 'A' },
      addresses: [
        {
          address_purpose: 'LOCATION',
          address_1: '200 QUEEN ST',
          city: 'KINSTON',
          state: 'NC',
          postal_code: '285041234',
          telephone_number: '',
        },
      ],
      taxonomies: [{ code: '208000000X', desc: 'Pediatrics', primary: true }],
    });
    const missingPhone = classifyHit(parsed, LENOIR_NC);
    assert.equal(missingPhone.action, 'keep');
    if (missingPhone.action === 'keep') {
      assert.equal(missingPhone.provider.quarantined, true);
      assert.equal(missingPhone.provider.enumerationType, 'NPI-2');
      assert.equal(missingPhone.provider.zipCode, '28504');
    }
  });

  it('carries the NPPES fax through to the kept provider', () => {
    const parsed = hitFromApiResult({
      number: '1679576722',
      enumeration_type: 'NPI-2',
      basic: { organization_name: 'KINSTON PEDIATRICS', status: 'A' },
      addresses: [
        {
          address_purpose: 'LOCATION',
          address_1: '200 QUEEN ST',
          city: 'KINSTON',
          state: 'NC',
          postal_code: '28504',
          telephone_number: '252-555-0100',
          fax_number: '252-555-0190',
        },
      ],
      taxonomies: [{ code: '208000000X', desc: 'Pediatrics', primary: true }],
    });
    assert.equal(parsed.locations[0].fax, '252-555-0190');
    const decision = classifyHit(parsed, LENOIR_NC);
    assert.equal(decision.action, 'keep');
    if (decision.action === 'keep') assert.equal(decision.provider.fax, '252-555-0190');
  });

  it('reports an absent NPPES fax as empty, not missing', () => {
    const parsed = hitFromApiResult({
      number: '1679576722',
      enumeration_type: 'NPI-1',
      basic: { first_name: 'HOOVER', last_name: 'ROYALS', status: 'A' },
      addresses: [
        {
          address_purpose: 'LOCATION',
          address_1: '200 QUEEN ST',
          city: 'KINSTON',
          state: 'NC',
          postal_code: '28504',
          telephone_number: '252-555-0100',
        },
      ],
      taxonomies: [{ code: '208000000X', desc: 'Pediatrics', primary: true }],
    });
    const decision = classifyHit(parsed, LENOIR_NC);
    assert.equal(decision.action, 'keep');
    if (decision.action === 'keep') assert.equal(decision.provider.fax, '');
  });
});
