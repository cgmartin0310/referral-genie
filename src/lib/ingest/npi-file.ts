import type { NpiRecord } from '@prisma/client';
import type { CountyMarket, CountyZip } from '../nppes/counties';
import type { RawHit } from '../nppes/types';

/** Records handled per call when pulling from the NPI file. */
export const FILE_SLICE = 100;

/** Shape a loaded NPI file row like an NPPES API hit so one classifier serves both. */
export function hitFromNpiRecord(record: NpiRecord): RawHit {
  return {
    npi: record.npi,
    enumerationType: record.entityType === '2' ? 'NPI-2' : 'NPI-1',
    name: record.name,
    status: 'A',
    taxonomies: record.taxonomyCodes.map((code) => ({
      code,
      desc: null,
      primary: code === record.primaryTaxonomyCode,
    })),
    locations: [
      {
        address1: record.address1 ?? '',
        address2: record.address2 ?? '',
        city: record.city ?? '',
        state: record.state ?? '',
        postalCode: record.postalCode ?? record.zip ?? '',
        phone: record.phone ?? '',
        fax: record.fax ?? '',
      },
    ],
    mailing: null,
  };
}

/**
 * The county's ZIP list plus any ZIP the file mapped to this county that the
 * crosswalk list lacks (a PO Box ZIP placed through its town). Without this
 * the classifier would flag such a row as outside the county.
 */
export function withRecordZips(county: CountyMarket, records: Pick<NpiRecord, 'zip' | 'countyMatch'>[]): CountyMarket {
  const known = new Set(county.zips.map((row) => row.zip));
  const extra: CountyZip[] = [];
  for (const record of records) {
    if (!record.zip || known.has(record.zip)) continue;
    known.add(record.zip);
    extra.push({
      zip: record.zip,
      city: '',
      role: 'boundary',
      note: record.countyMatch === 'city'
        ? 'PO Box ZIP placed in this county through its town (NPI file)'
        : `ZIP mapped to this county by the ${record.countyMatch === 'hud' ? 'HUD USPS' : 'Census ZCTA'} crosswalk`,
    });
  }
  return extra.length === 0 ? county : { ...county, zips: [...county.zips, ...extra] };
}
