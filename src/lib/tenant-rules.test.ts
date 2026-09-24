import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isParagonOrgName, roleFor, slugFor } from './tenant-rules';

describe('tenant rules', () => {
  it('recognizes the Paragon organization by name', () => {
    assert.equal(isParagonOrgName('Paragon'), true);
    assert.equal(isParagonOrgName(' paragon '), true);
    assert.equal(isParagonOrgName('Paragon Billing Holdings'), false);
    assert.equal(isParagonOrgName('Boom Therapy Group'), false);
  });

  it('makes every Paragon member an admin and maps subscriber roles', () => {
    assert.equal(roleFor('paragon', 'org:member'), 'paragon_admin');
    assert.equal(roleFor('subscriber', 'org:admin'), 'owner');
    assert.equal(roleFor('subscriber', 'org:owner'), 'owner');
    assert.equal(roleFor('subscriber', 'org:member'), 'staff');
    assert.equal(roleFor('subscriber', 'org:intake'), 'staff');
    assert.equal(roleFor('subscriber', null), 'staff');
  });

  it('makes a unique slug from the organization name', () => {
    const taken = new Set(['boom-therapy-group']);
    assert.equal(slugFor('Boom Therapy Group', (slug) => taken.has(slug)), 'boom-therapy-group-2');
    assert.equal(slugFor('AOT Pediatric Therapy', () => false), 'aot-pediatric-therapy');
    assert.equal(slugFor('***', () => false), 'subscriber');
  });
});
