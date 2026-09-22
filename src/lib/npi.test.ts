import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { normalizeNpiNumber } from './npi';

describe('normalizeNpiNumber', () => {
  it('keeps a real NPI and trims surrounding whitespace', () => {
    assert.equal(normalizeNpiNumber('1234567893'), '1234567893');
    assert.equal(normalizeNpiNumber('  1234567893  '), '1234567893');
  });

  it('stores a missing or blank NPI as null', () => {
    assert.equal(normalizeNpiNumber(undefined), null);
    assert.equal(normalizeNpiNumber(null), null);
    assert.equal(normalizeNpiNumber(''), null);
    assert.equal(normalizeNpiNumber('   '), null);
    assert.equal(normalizeNpiNumber('\t\n'), null);
  });
});

describe('npi unique migrations', () => {
  it('nulls blank NPIs before creating the composite unique index', () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        'prisma/migrations/20260921120000_graph_fields_org_county_ingest/migration.sql',
      ),
      'utf8',
    );
    const updateAt = sql.indexOf('SET "npiNumber" = NULL');
    const indexAt = sql.indexOf(
      'CREATE UNIQUE INDEX "ReferralSource_organizationId_npiNumber_key"',
    );
    assert.ok(updateAt > 0, 'blank NPI update missing');
    assert.ok(indexAt > updateAt, 'unique index is created before blank NPIs are nulled');
    assert.match(sql, /"npiNumber" ~ '\^\[\[:space:\]\]\*\$'/);
  });

  it('ships an idempotent follow-up for databases that already applied the index', () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        'prisma/migrations/20260922120000_normalize_blank_npi_numbers/migration.sql',
      ),
      'utf8',
    );
    const updateAt = sql.indexOf('SET "npiNumber" = NULL');
    const indexAt = sql.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ReferralSource_organizationId_npiNumber_key"',
    );
    assert.ok(updateAt > 0);
    assert.ok(indexAt > updateAt);
  });
});
