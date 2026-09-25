import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanEmail, inviteRedirectUrl, subscriberInput } from './subscriber-rules';

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe('new subscribers', () => {
  it('accepts a company name and owner email', () => {
    assert.deepEqual(subscriberInput({ name: '  Kidology  Therapy ', ownerEmail: 'Owner@Kidology.com ' }, ['Paragon']), {
      name: 'Kidology Therapy',
      ownerEmail: 'owner@kidology.com',
    });
  });
  it('refuses Paragon, a name already taken, and a bad email', () => {
    assert.ok('error' in subscriberInput({ name: 'paragon', ownerEmail: 'a@b.co' }, []));
    assert.ok('error' in subscriberInput({ name: 'Advantage OT', ownerEmail: 'a@b.co' }, ['advantage ot']));
    assert.ok('error' in subscriberInput({ name: 'Advantage OT', ownerEmail: 'not an email' }, []));
    assert.equal(cleanEmail('x@y'), null);
  });
  it('sends invitation links to the host the request came in on', () => {
    assert.equal(inviteRedirectUrl(headers({ host: 'referral-genie.onrender.com' })), 'https://referral-genie.onrender.com/accept-invite');
    assert.equal(inviteRedirectUrl(headers({ 'x-forwarded-host': 'app.example.com', 'x-forwarded-proto': 'https', host: 'localhost:10000' })), 'https://app.example.com/accept-invite');
    assert.equal(inviteRedirectUrl(headers({ host: 'localhost:3000' })), 'http://localhost:3000/accept-invite');
  });
});
