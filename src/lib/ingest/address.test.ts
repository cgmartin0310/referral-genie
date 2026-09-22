import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeStreet } from './address';

describe('street normalization', () => {
  it('expands street types and directionals', () => {
    assert.equal(normalizeStreet('100 King St').street, '100 king street');
    assert.equal(normalizeStreet('100 KING STREET').street, '100 king street');
    assert.equal(normalizeStreet('2100 N Herritage Ave').street, '2100 north herritage avenue');
    assert.equal(normalizeStreet('12 SW Doctors Dr.').street, '12 southwest doctors drive');
  });

  it('reads the suite however it was written', () => {
    for (const raw of ['100 King St Suite 200', '100 King Street, Ste 200', '100 King St #200', '100 King St Unit 200']) {
      assert.deepEqual(normalizeStreet(raw), { street: '100 king street', unit: 'suite 200' }, raw);
    }
  });

  it('keeps floor and building distinct from a suite', () => {
    assert.equal(normalizeStreet('100 King St Floor 2').unit, 'floor 2');
    assert.equal(normalizeStreet('100 King St Bldg 2').unit, 'building 2');
    assert.notEqual(normalizeStreet('100 King St Floor 2').unit, normalizeStreet('100 King St Ste 2').unit);
  });

  it('reports no unit when none was written', () => {
    assert.equal(normalizeStreet('100 King St').unit, null);
  });

  it('survives punctuation and extra whitespace', () => {
    assert.deepEqual(normalizeStreet('  100   King  St.,  Ste. 200  '), {
      street: '100 king street',
      unit: 'suite 200',
    });
  });
});
