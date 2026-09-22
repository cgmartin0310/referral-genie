import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { headerIndex, parseCsvLine } from './csv';

describe('NPI file CSV', () => {
  it('parses quoted fields with commas and doubled quotes', () => {
    assert.deepEqual(parseCsvLine('"1871577197","2","KINSTON PEDIATRIC ASSOCIATES PA","",""'), [
      '1871577197', '2', 'KINSTON PEDIATRIC ASSOCIATES PA', '', '',
    ]);
    assert.deepEqual(parseCsvLine('"A, B","say ""hi""",plain\r'), ['A, B', 'say "hi"', 'plain']);
  });

  it('finds columns by name and refuses a missing one', () => {
    const col = headerIndex(['NPI', 'Entity Type Code', 'Provider Business Practice Location Address Postal Code']);
    assert.equal(col('Entity Type Code'), 1);
    assert.throws(() => col('Nope'));
  });
});
