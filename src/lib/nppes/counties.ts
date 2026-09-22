import rawCounties from '../../data/us-counties.json';
import zctaCounty from '../../data/zcta-county.json';

/**
 * Counties the NPI pull can query.
 *
 * NPPES has no county parameter, so a county is pulled by its practice-location
 * ZIPs. Any US county gets its ZIP list from the Census 2020 ZCTA-to-county
 * relationship file (src/data/zcta-county.json, built by
 * scripts/build-zcta-county.mjs): ZCTAs with at least 15% of their land inside
 * the county. Lenoir County, NC keeps a hand-checked list with place names.
 *
 * ZIP codes are not counties. A ZCTA that is 90% or more inside the county is
 * `core`; the rest are `boundary`, queried because they cover a place in the
 * county, and those rows are flagged. PO Box ZIPs are not ZCTAs and are never
 * queried.
 */

export interface CountyZip {
  zip: string;
  city: string;
  role: 'core' | 'boundary';
  note: string;
}

export interface CountyMarket {
  id: string;
  name: string;
  state: string;
  fips: string;
  zips: CountyZip[];
}

/** Share of a ZCTA's land that must lie inside the county for it to be queried. */
export const MIN_ZIP_SHARE = 0.15;
/** At or above this share the ZIP is `core`; below it is `boundary`. */
export const CORE_ZIP_SHARE = 0.9;

export const LENOIR_NC: CountyMarket = {
  id: 'lenoir-nc',
  name: 'Lenoir County',
  state: 'NC',
  fips: '37107',
  zips: [
    { zip: '28504', city: 'Kinston', role: 'core', note: 'About 98% of ZCTA land area in Lenoir' },
    { zip: '28525', city: 'Deep Run', role: 'core', note: 'About 92% of ZCTA land area in Lenoir' },
    { zip: '28501', city: 'Kinston', role: 'boundary', note: 'About 75% of ZCTA land area in Lenoir. Primary Kinston street ZIP' },
    { zip: '28551', city: 'La Grange', role: 'boundary', note: 'About 58% of ZCTA land area in Lenoir' },
    { zip: '28530', city: 'Grifton', role: 'boundary', note: 'About 36% of ZCTA land area in Lenoir; rest is mostly Pitt' },
    { zip: '28578', city: 'Seven Springs', role: 'boundary', note: 'About 28% of ZCTA land area in Lenoir; rest is mostly Wayne' },
    { zip: '28572', city: 'Pink Hill', role: 'boundary', note: 'About 27% of ZCTA land area in Lenoir; rest is mostly Duplin' },
    { zip: '28538', city: 'Hookerton', role: 'boundary', note: 'About 18% of ZCTA land area in Lenoir; rest is mostly Greene' },
  ],
};

const CURATED: Record<string, CountyMarket> = {
  [LENOIR_NC.id]: LENOIR_NC,
};
const CURATED_BY_FIPS = new Map(Object.values(CURATED).map((county) => [county.fips, county]));

type ZctaRows = Record<string, [string, number][]>;
const ZCTA_BY_COUNTY = zctaCounty as unknown as ZctaRows;

interface UsCountyRow {
  fips: string;
  name: string;
  state: string;
}
const US_BY_FIPS = new Map((rawCounties as UsCountyRow[]).map((county) => [county.fips, county]));

/** The ZIPs the pull queries for a county, from the Census crosswalk. Null when the county has none. */
export function zipListForFips(fips: string): CountyZip[] | null {
  const rows = ZCTA_BY_COUNTY[fips];
  if (!rows) return null;
  const zips = rows
    .filter(([, share]) => share >= MIN_ZIP_SHARE)
    .map(([zip, share]) => ({
      zip,
      city: '',
      role: share >= CORE_ZIP_SHARE ? ('core' as const) : ('boundary' as const),
      note: `About ${Math.round(share * 100)}% of ZCTA land area in this county`,
    }));
  return zips.length > 0 ? zips : null;
}

/**
 * A pullable county for any 5-digit FIPS. The hand-checked list wins where
 * one exists; otherwise the crosswalk supplies the ZIPs and the county's own
 * FIPS is its id.
 */
export function countyMarketForFips(fips: string): CountyMarket | null {
  const curated = CURATED_BY_FIPS.get(fips);
  if (curated) return curated;
  const county = US_BY_FIPS.get(fips);
  const zips = zipListForFips(fips);
  if (!county || !zips) return null;
  return { id: fips, name: county.name, state: county.state, fips, zips };
}

/** Counties with a hand-checked ZIP list. Every other county is reached through `getCounty(fips)`. */
export function listCounties(): CountyMarket[] {
  return Object.values(CURATED);
}

export function getCounty(id: string): CountyMarket {
  const curated = CURATED[id];
  if (curated) return curated;
  if (/^\d{5}$/.test(id)) {
    const county = countyMarketForFips(id);
    if (county) return county;
  }
  throw new Error(`Unknown county "${id}". Use a hand-checked county id or a 5-digit county FIPS.`);
}

export function zipRole(county: CountyMarket, zip5: string): 'core' | 'boundary' | null {
  const found = county.zips.find((row) => row.zip === zip5);
  return found ? found.role : null;
}
