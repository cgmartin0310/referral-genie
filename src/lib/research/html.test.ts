import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBlockedHost, practiceUrl } from './html';

describe('research host blocklist', () => {
  it('blocks loopback, link-local, private, and metadata hosts', () => {
    for (const host of ['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', 'fe80::1', 'fc00::1', 'fd12::1', 'metadata.google.internal']) {
      assert.equal(isBlockedHost(host), true, host);
    }
  });

  it('does not block a public domain that happens to start with fc or fd', () => {
    // These were silently skipped, so any practice on such a domain was never researched.
    for (const host of ['fdanews.com', 'fcpediatrics.com', 'fdpediatrics.org', 'fchn.org', 'fd-clinic.net']) {
      assert.equal(isBlockedHost(host), false, host);
    }
  });

  it('adds a scheme and rejects non-public URLs', () => {
    assert.equal(practiceUrl('kinstonpeds.com'), 'https://kinstonpeds.com/');
    assert.equal(practiceUrl('http://localhost:3000'), null);
    assert.equal(practiceUrl('ftp://example.com'), null);
  });
});
