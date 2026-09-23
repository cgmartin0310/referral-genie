/**
 * Street normalization for practice identity.
 *
 * NPPES addresses are typed by hand, so the same suite arrives as
 * "100 King St Suite 200", "100 King Street, Ste 200", and "100 King St #200".
 * Those must produce one key or a single practice splits into three.
 *
 * The suite is kept in the key on purpose: different suites at one street
 * address are usually different practices, and merging them would inflate the
 * provider count that the referral estimate is built on.
 */

const DIRECTIONAL: Record<string, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
};

const STREET_TYPE: Record<string, string> = {
  st: 'street',
  str: 'street',
  ave: 'avenue',
  av: 'avenue',
  rd: 'road',
  dr: 'drive',
  drv: 'drive',
  blvd: 'boulevard',
  ln: 'lane',
  ct: 'court',
  cir: 'circle',
  pl: 'place',
  plz: 'plaza',
  pkwy: 'parkway',
  pky: 'parkway',
  hwy: 'highway',
  ter: 'terrace',
  terr: 'terrace',
  sq: 'square',
  trl: 'trail',
  expy: 'expressway',
  fwy: 'freeway',
};

const STREET_TYPE_WORDS = new Set(Object.values(STREET_TYPE));

/**
 * Words that mark a tenant space. The suite family collapses to one token so
 * "Ste 200", "Unit 200", and "#200" agree. Floor and building stay distinct
 * because "Floor 2" is not "Suite 2".
 */
const UNIT_TYPE: Record<string, string> = {
  ste: 'suite',
  suite: 'suite',
  unit: 'suite',
  rm: 'suite',
  room: 'suite',
  ofc: 'suite',
  office: 'suite',
  apt: 'apartment',
  apartment: 'apartment',
  fl: 'floor',
  flr: 'floor',
  floor: 'floor',
  bldg: 'building',
  building: 'building',
  dept: 'department',
  department: 'department',
};

export interface NormalizedAddress {
  /** Street line with directionals and street types expanded. */
  street: string;
  /** Canonical tenant space, e.g. "suite 200". Null when none was written. */
  unit: string | null;
}

export function normalizeStreet(raw: string): NormalizedAddress {
  const text = raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    // "#200" and "# 200" are suite markers
    .replace(/#\s*([a-z0-9-]+)/g, ' suite $1 ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = text.split(' ').filter((token) => token.length > 0);
  const streetTokens: string[] = [];
  let unit: string | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const unitType = UNIT_TYPE[token];
    const next = tokens[index + 1];
    if (unitType && next && /^[a-z0-9-]+$/.test(next)) {
      // First unit wins; a later one is part of the street line.
      if (unit === null) unit = `${unitType} ${next}`;
      index += 1;
      continue;
    }
    streetTokens.push(DIRECTIONAL[token] ?? STREET_TYPE[token] ?? token);
  }

  // Google writes a suite bare after the street: "701 Doctors Dr e1",
  // "109 Airport Rd A". A short token right after the street type is that
  // suite. A directional there ("Main St N") was already expanded to a word.
  if (unit === null && streetTokens.length >= 3) {
    const last = streetTokens[streetTokens.length - 1];
    const before = streetTokens[streetTokens.length - 2];
    if (STREET_TYPE_WORDS.has(before) && /^(?:[a-z]|[a-z]?\d{1,4}[a-z]?)$/.test(last)) {
      streetTokens.pop();
      unit = `suite ${last}`;
    }
  }

  return {
    street: streetTokens.join(' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(),
    unit,
  };
}
