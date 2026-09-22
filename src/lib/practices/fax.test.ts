import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planFaxSends, resolveFaxTarget, type FaxPractice, type FaxProvider } from './fax';

const practice: FaxPractice = { id: 'p1', name: 'Kinston Pediatrics', faxNumber: '(252) 555-0190' };

function provider(overrides: Partial<FaxProvider> & { id: string }): FaxProvider {
  return { name: `Dr ${overrides.id}`, faxNumber: null, useOwnFax: false, ...overrides };
}

describe('fax target', () => {
  it('sends to the practice by default', () => {
    const target = resolveFaxTarget(provider({ id: 'a', faxNumber: '252-555-0111' }), practice);
    assert.equal(target.number, '2525550190');
    assert.equal(target.level, 'practice');
    assert.equal(target.fellBack, false);
  });

  it('sends to the provider when the setting is on', () => {
    const target = resolveFaxTarget(provider({ id: 'a', faxNumber: '252-555-0111', useOwnFax: true }), practice);
    assert.equal(target.number, '2525550111');
    assert.equal(target.level, 'provider');
  });

  it('falls back to the practice and says so when the provider has no fax', () => {
    const target = resolveFaxTarget(provider({ id: 'a', useOwnFax: true }), practice);
    assert.equal(target.number, '2525550190');
    assert.equal(target.level, 'practice');
    assert.equal(target.fellBack, true);
  });

  it('reports no number when neither level has one', () => {
    const target = resolveFaxTarget(provider({ id: 'a' }), { id: 'p2', name: 'No Fax PA', faxNumber: null });
    assert.equal(target.number, null);
  });

  it('rejects an unusable fax number', () => {
    const target = resolveFaxTarget(provider({ id: 'a' }), { id: 'p3', name: 'Bad', faxNumber: '000-000-0000' });
    assert.equal(target.number, null);
  });
});

describe('fax send plan', () => {
  it('sends one page per machine, not one per provider', () => {
    const targets = ['a', 'b', 'c'].map((id) => resolveFaxTarget(provider({ id }), practice));
    const plan = planFaxSends(targets);
    assert.equal(plan.sends.length, 1);
    assert.equal(plan.sends[0].providerNames.length, 3);
    assert.deepEqual(plan.sends[0].providerNames, ['Dr a', 'Dr b', 'Dr c']);
  });

  it('gives a provider with their own line a separate send', () => {
    const targets = [
      resolveFaxTarget(provider({ id: 'a' }), practice),
      resolveFaxTarget(provider({ id: 'b' }), practice),
      resolveFaxTarget(provider({ id: 'c', faxNumber: '252-555-0111', useOwnFax: true }), practice),
    ];
    const plan = planFaxSends(targets);
    assert.equal(plan.sends.length, 2);
    assert.equal(plan.sends.find((send) => send.number === '2525550111')?.providerNames.length, 1);
    assert.equal(plan.sends.find((send) => send.number === '2525550190')?.providerNames.length, 2);
  });

  it('treats a shared "provider" line as an office line', () => {
    const shared = '252-555-0111';
    const targets = [
      resolveFaxTarget(provider({ id: 'a', faxNumber: shared, useOwnFax: true }), practice),
      resolveFaxTarget(provider({ id: 'b', faxNumber: shared, useOwnFax: true }), practice),
    ];
    const plan = planFaxSends(targets);
    assert.equal(plan.sends.length, 1);
    assert.equal(plan.sends[0].level, 'practice');
  });

  it('collects unreachable providers and counts fallbacks', () => {
    const noFax: FaxPractice = { id: 'p2', name: 'No Fax PA', faxNumber: null };
    const plan = planFaxSends([
      resolveFaxTarget(provider({ id: 'a', useOwnFax: true }), practice),
      resolveFaxTarget(provider({ id: 'b' }), noFax),
    ]);
    assert.equal(plan.fellBack, 1);
    assert.equal(plan.unreachable.length, 1);
    assert.equal(plan.unreachable[0].providerId, 'b');
    assert.equal(plan.sends.length, 1);
  });
});
