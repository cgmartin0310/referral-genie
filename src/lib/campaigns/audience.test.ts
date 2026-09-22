import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAudience, type AudiencePractice } from './audience';

function practice(overrides: Partial<AudiencePractice> & { id: string }): AudiencePractice {
  return { name: `Practice ${overrides.id}`, faxNumber: '252-555-0190', providers: [], ...overrides };
}

const person = (id: string, extra: Partial<AudiencePractice['providers'][number]> = {}) => ({
  id,
  name: `Dr ${id}`,
  faxNumber: null,
  useOwnFax: false,
  ...extra,
});

describe('campaign audience', () => {
  it('sends one page to a practice however many providers work there', () => {
    const audience = buildAudience([
      practice({ id: 'hospital', providers: [person('a'), person('b'), person('c')] }),
    ]);
    assert.equal(audience.targets.length, 1);
    assert.equal(audience.targets[0].faxNumber, '2525550190');
    assert.equal(audience.targets[0].toName, 'Practice hospital');
    assert.deepEqual(audience.targets[0].providerNames, ['Dr a', 'Dr b', 'Dr c']);
    assert.equal(audience.providers, 3);
  });

  it('gives a provider on their own line a separate page addressed to them', () => {
    const audience = buildAudience([
      practice({
        id: 'p',
        providers: [person('a'), person('b', { faxNumber: '252-555-0111', useOwnFax: true })],
      }),
    ]);
    assert.equal(audience.targets.length, 2);
    const own = audience.targets.find((target) => target.level === 'provider');
    assert.equal(own?.toName, 'Dr b');
    assert.equal(own?.faxNumber, '2525550111');
  });

  it('faxes an org-only or hand-added practice at its office number', () => {
    const audience = buildAudience([practice({ id: 'school', name: 'Kinston Elementary' })]);
    assert.equal(audience.targets.length, 1);
    assert.equal(audience.targets[0].toName, 'Kinston Elementary');
    assert.equal(audience.providers, 0);
  });

  it('reports what cannot be reached instead of dropping it silently', () => {
    const audience = buildAudience([
      practice({ id: 'nofax', faxNumber: null, providers: [person('a')] }),
      practice({ id: 'empty', faxNumber: null }),
      practice({ id: 'fallback', providers: [person('b', { useOwnFax: true })] }),
    ]);
    assert.equal(audience.unreachable.length, 2);
    assert.deepEqual(audience.unreachable[0].providerNames, ['Dr a']);
    assert.equal(audience.fellBack, 1);
    assert.equal(audience.targets.length, 1);
  });
});
