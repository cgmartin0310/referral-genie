import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { trustBand, trustScore } from './trs';
import { parseCsv, parseImport } from './import';
import { buildCatalogIndex, matchToCatalog } from './match';

describe('trust relationship score', () => {
  it('adds recency, volume, strength, and origin, capped at 100', () => {
    assert.equal(trustScore({ lastReferral: 'within_90d', referralVolume: 'ten_plus', strength: 'established', origin: 'personal' }), 100);
    assert.equal(trustScore({ lastReferral: '6_12m', referralVolume: 'two_four', strength: 'met_once', origin: 'unknown' }), 44);
    assert.equal(trustScore({}), 0);
    assert.equal(trustScore({ lastReferral: 'made-up' }), 0);
  });

  it('bands scores the way the spec cadence does', () => {
    assert.equal(trustBand(88), 'trusted');
    assert.equal(trustBand(55), 'warm');
    assert.equal(trustBand(12), 'cold');
  });
});

describe('source spreadsheet import', () => {
  it('parses quoted fields with commas, quotes, and line breaks', () => {
    assert.deepEqual(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\n1,2,3,4\n'), [
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('maps common headers, turns dates and counts into answers, and rejects bad rows', () => {
    const csv = [
      'Provider Name,Practice,NPI,Fax #,Phone,Last referral date,# of referrals,Relationship Strength,Zip Code',
      'Joan Perry,Kinston Pediatric Associates,1234567893,(252) 522-4016,252.522.0335,2026-08-15,6,Knows us professionally,28501-1234',
      ',Nameless Practice,,,,,,,',
      'Bad NPI,Somewhere,12345,,,,,,',
    ].join('\n');
    const parsed = parseImport(csv, new Date('2026-09-23'));
    assert.equal(parsed.rows.length, 1);
    const [row] = parsed.rows;
    assert.equal(row.name, 'Joan Perry');
    assert.equal(row.practiceName, 'Kinston Pediatric Associates');
    assert.equal(row.fax, '2525224016');
    assert.equal(row.zip, '28501');
    assert.equal(row.type, 'physician');
    assert.deepEqual(row.answers, { lastReferral: 'within_90d', referralVolume: 'five_nine', strength: 'knows_professionally', origin: null });
    assert.deepEqual(parsed.rejected.map((r) => r.line), [3, 4]);
  });

  it('treats a sheet with only a practice column as a list of practices', () => {
    const parsed = parseImport('Practice,Fax\nLaGrange Pediatrics,252-566-4430\n');
    assert.equal(parsed.rows[0].name, 'LaGrange Pediatrics');
    assert.equal(parsed.rows[0].type, 'practice');
  });

  it('refuses a sheet with no name column', () => {
    const parsed = parseImport('Fax,Phone\n2525224016,2525220335\n');
    assert.equal(parsed.rows.length, 0);
    assert.match(parsed.rejected[0].reason, /No name column/);
  });
});

describe('matching a source to the catalog', () => {
  const index = buildCatalogIndex([
    { id: 'kpa', name: 'Kinston Pediatric Associates PA', placeName: 'Kinston Pediatric Associates', zipCode: '28501', faxNumber: '252-522-4016', phone: '(252) 522-0335', orgNpis: ['1871577197'], providerNpis: ['1528042728'] },
    { id: 'lgp', name: 'LaGrange Pediatrics', placeName: null, zipCode: '28551', faxNumber: null, phone: '2525665999', orgNpis: [], providerNpis: [] },
  ]);

  it('matches by a provider NPI first', () => {
    assert.deepEqual(matchToCatalog({ npi: '1528042728', name: 'Joan Perry' }, index), { practiceId: 'kpa', matchedBy: 'npi' });
  });

  it('then by fax, then phone', () => {
    assert.equal(matchToCatalog({ fax: '(252) 522-4016', name: 'Front desk' }, index)?.matchedBy, 'fax');
    assert.equal(matchToCatalog({ phone: '252.566.5999', name: 'Someone' }, index)?.practiceId, 'lgp');
  });

  it('then by the practice name in the same ZIP, ignoring PA and punctuation', () => {
    assert.deepEqual(matchToCatalog({ name: 'Dr. Perry', practiceName: 'Kinston Pediatric Associates, P.A.', zip: '28501' }, index), { practiceId: 'kpa', matchedBy: 'name' });
    assert.equal(matchToCatalog({ name: 'Kinston Pediatric Associates', zip: '27514' }, index), null);
  });
});
