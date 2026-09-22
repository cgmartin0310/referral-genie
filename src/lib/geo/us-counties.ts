import rawCounties from '../../data/us-counties.json';
import { listCounties } from '../nppes/counties';

export interface UsCounty {
  fips: string;
  name: string;
  state: string;
}

export interface StateOption {
  code: string;
  name: string;
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  AS: 'American Samoa',
  GU: 'Guam',
  MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico',
  VI: 'U.S. Virgin Islands',
};

const ALL_COUNTIES = rawCounties as UsCounty[];

const BY_FIPS = new Map(ALL_COUNTIES.map((county) => [county.fips, county]));

const SEED_ID_BY_FIPS = new Map(listCounties().map((county) => [county.fips, county.id]));

export function getUsCounty(fips: string): UsCounty | null {
  return BY_FIPS.get(fips) ?? null;
}

export function countiesInState(state: string): UsCounty[] {
  const code = state.trim().toUpperCase();
  return ALL_COUNTIES.filter((county) => county.state === code);
}

export function listStateOptions(): StateOption[] {
  const codes = [...new Set(ALL_COUNTIES.map((county) => county.state))];
  return codes
    .sort((a, b) => stateName(a).localeCompare(stateName(b)))
    .map((code) => ({ code, name: stateName(code) }));
}

export function stateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

/**
 * Census county FIPS is 5 digits (state + county). Market rows, ingest runs,
 * and referral sources can pick up spaces or punctuation; compare the digits.
 */
export function normalizeCountyFips(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (!/^\d{1,5}$/.test(digits)) return null;
  return digits.padStart(5, '0');
}

/** County id for the existing NPI pull, when a practice-location ZIP list exists. */
export function seedCountyIdForFips(fips: string): string | null {
  const normalized = normalizeCountyFips(fips);
  if (!normalized) return null;
  return SEED_ID_BY_FIPS.get(normalized) ?? null;
}
