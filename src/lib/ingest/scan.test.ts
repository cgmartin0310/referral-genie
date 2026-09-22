import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TAXONOMY_SEARCHES } from '../nppes/taxonomies';
import { emptyCursor } from './summary';
import { advanceScanCursor, searchDescriptionAt } from './scan';

describe('county scan', () => {
  it('scans each ZIP unfiltered first and only falls back when the cap is hit', () => {
    assert.equal(searchDescriptionAt(0), null);
    assert.equal(searchDescriptionAt(1), TAXONOMY_SEARCHES[0].search);

    const cursor = emptyCursor();
    // A short page: the ZIP is done, no fallbacks.
    let step = advanceScanCursor(cursor, 3, { rawCount: 40 });
    assert.deepEqual([cursor.zipIndex, cursor.searchIndex, cursor.skip], [1, 0, 0]);
    assert.equal(step.addedQueries, 0);

    // Full pages page forward; a full page at the cap turns on the fallbacks.
    step = advanceScanCursor(cursor, 3, { rawCount: 200 });
    assert.equal(cursor.skip, 200);
    cursor.skip = 1000;
    step = advanceScanCursor(cursor, 3, { rawCount: 200 });
    assert.equal(step.truncated, true);
    assert.equal(step.addedQueries, TAXONOMY_SEARCHES.length);
    assert.deepEqual([cursor.zipIndex, cursor.searchIndex, cursor.skip], [1, 1, 0]);

    // Fallbacks walk the description list, then the next ZIP.
    for (let i = 1; i < TAXONOMY_SEARCHES.length; i += 1) advanceScanCursor(cursor, 3, { rawCount: 10 });
    assert.equal(cursor.searchIndex, TAXONOMY_SEARCHES.length);
    advanceScanCursor(cursor, 3, { rawCount: 10 });
    assert.deepEqual([cursor.zipIndex, cursor.searchIndex], [2, 0]);

    advanceScanCursor(cursor, 3, { rawCount: 10 });
    assert.equal(cursor.phase, 'group');
  });
});
