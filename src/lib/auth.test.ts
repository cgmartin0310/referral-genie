import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readAuthCredentials } from './auth';

const ORIGINAL_USER = process.env.AUTH_USERNAME;
const ORIGINAL_PASSWORD = process.env.AUTH_PASSWORD;

afterEach(() => {
  if (ORIGINAL_USER === undefined) delete process.env.AUTH_USERNAME;
  else process.env.AUTH_USERNAME = ORIGINAL_USER;
  if (ORIGINAL_PASSWORD === undefined) delete process.env.AUTH_PASSWORD;
  else process.env.AUTH_PASSWORD = ORIGINAL_PASSWORD;
});

describe('readAuthCredentials', () => {
  it('rejects login when either env var is missing', () => {
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD;
    assert.equal(readAuthCredentials(), null);

    process.env.AUTH_USERNAME = 'operator';
    delete process.env.AUTH_PASSWORD;
    assert.equal(readAuthCredentials(), null);

    delete process.env.AUTH_USERNAME;
    process.env.AUTH_PASSWORD = 'secret';
    assert.equal(readAuthCredentials(), null);
  });

  it('returns the configured pair with no code default', () => {
    process.env.AUTH_USERNAME = ' operator ';
    process.env.AUTH_PASSWORD = 'a long secret';
    assert.deepEqual(readAuthCredentials(), { username: 'operator', password: 'a long secret' });
  });
});
