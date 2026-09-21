/**
 * Design-partner market: Lenoir County, NC (Kinston).
 *
 * ZIP codes are not counties. Land-share notes are the Census 2020 ZCTA share
 * inside FIPS 37107. `core` is about 90% or more of the ZCTA. `boundary` is
 * queried because it covers a Lenoir place, and those rows are flagged.
 * PO Box ZIPs 28502 and 28503 are not ZCTAs and are not queried.
 * 28526 (~6%, Dover) and 28580 (~0.4%, Snow Hill) are omitted so the pull
 * does not mostly return neighboring counties.
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

const COUNTIES: Record<string, CountyMarket> = {
  [LENOIR_NC.id]: LENOIR_NC,
};

export function listCounties(): CountyMarket[] {
  return Object.values(COUNTIES);
}

export function getCounty(id: string): CountyMarket {
  const county = COUNTIES[id];
  if (!county) {
    const known = Object.keys(COUNTIES).join(', ');
    throw new Error(`Unknown county "${id}". Known counties: ${known}`);
  }
  return county;
}

export function zipRole(county: CountyMarket, zip5: string): 'core' | 'boundary' | null {
  const found = county.zips.find((row) => row.zip === zip5);
  return found ? found.role : null;
}
