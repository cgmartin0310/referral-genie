import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  changedOverridableFields,
  nextIngestProvenance,
  stripOverriddenFields,
  userEditProvenance,
} from './provenance';

describe('provenance overrides', () => {
  it('records who changed a field', () => {
    const next = userEditProvenance(
      { origin: 'places', confidence: 0.86, overriddenBy: null, overriddenAt: null, overriddenFields: [] },
      ['contactPhone'],
      'casey',
      '2026-09-21T00:00:00.000Z',
    );
    assert.equal(next.origin, 'mixed');
    assert.equal(next.overriddenBy, 'casey');
    assert.deepEqual(next.overriddenFields, ['contactPhone']);
    assert.equal(next.confidence, 0.86);
  });

  it('does not treat blank form values as a change from null', () => {
    const changed = changedOverridableFields(
      { contactPhone: null, name: 'Jane Doe' },
      { contactPhone: '', name: 'Jane Doe' },
    );
    assert.deepEqual(changed, []);
  });

  it('keeps overridden fields on the next ingest', () => {
    const existing = userEditProvenance(null, ['rating', 'website'], 'casey', '2026-09-21T00:00:00.000Z');
    const provenance = nextIngestProvenance(existing, 0.8, 'places');
    const update = stripOverriddenFields(
      { rating: 4.2, website: 'https://example.test', contactPhone: '252-555-0100', name: 'New Name' },
      provenance.overriddenFields,
    );
    assert.equal(provenance.origin, 'mixed');
    assert.equal(provenance.confidence, 0.8);
    assert.equal(update.rating, undefined);
    assert.equal(update.website, undefined);
    assert.equal(update.contactPhone, '252-555-0100');
    assert.equal(update.name, 'New Name');
  });
});
