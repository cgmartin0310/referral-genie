import zctaCounty from '../../data/zcta-county.json';
import zipCounty from '../../data/zip-county.json';

/**
 * Practice-location ZIP → county, for rows from the NPI file.
 *
 * Three lookups, in order:
 * 1. The HUD USPS ZIP-County crosswalk (src/data/zip-county.json): the county
 *    holding most of the ZIP's addresses. Covers most street and PO Box ZIPs.
 * 2. The Census ZCTA-to-county crosswalk by land share, for ZCTAs HUD lacks.
 * 3. City and state, for ZIPs in neither: the county that rows with the same
 *    city and state landed in through 1 or 2. Kinston 28502 is in neither
 *    file and resolves to Lenoir because Kinston 28501 and 28504 did.
 */

type ZctaRows = Record<string, [string, number][]>;

let zipIndex: Map<string, { fips: string; share: number }> | null = null;

function index(): Map<string, { fips: string; share: number }> {
  if (zipIndex) return zipIndex;
  const best = new Map<string, { fips: string; share: number }>();
  for (const [fips, rows] of Object.entries(zctaCounty as unknown as ZctaRows)) {
    for (const [zip, share] of rows) {
      const current = best.get(zip);
      if (!current || share > current.share) best.set(zip, { fips, share });
    }
  }
  zipIndex = best;
  return best;
}

/** The county holding most of this ZCTA, or null when the ZIP is not a ZCTA. */
export function countyForZcta(zip: string): { fips: string; share: number } | null {
  return index().get(zip) ?? null;
}

const HUD = zipCounty as unknown as Record<string, string>;

export type CountyMatch = 'hud' | 'zcta';

/** County for a ZIP from the crosswalk files, and which one answered. */
export function countyForZip(zip: string): { fips: string; match: CountyMatch } | null {
  const hud = HUD[zip];
  if (hud) return { fips: hud, match: 'hud' };
  const zcta = countyForZcta(zip);
  return zcta ? { fips: zcta.fips, match: 'zcta' } : null;
}

export function zip5(postal: string | null | undefined): string | null {
  const digits = (postal ?? '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

function cityKey(state: string | null | undefined, city: string | null | undefined): string | null {
  const s = (state ?? '').trim().toUpperCase();
  const c = (city ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (s.length !== 2 || !c) return null;
  return `${s}|${c}`;
}

/**
 * Learns city+state → county from rows whose ZIP mapped through the ZCTA
 * crosswalk, then answers for rows whose ZIP did not.
 */
export class CityCountyMap {
  private votes = new Map<string, Map<string, number>>();

  learn(state: string | null | undefined, city: string | null | undefined, fips: string): void {
    const key = cityKey(state, city);
    if (!key) return;
    const counts = this.votes.get(key) ?? new Map<string, number>();
    counts.set(fips, (counts.get(fips) ?? 0) + 1);
    this.votes.set(key, counts);
  }

  resolve(state: string | null | undefined, city: string | null | undefined): string | null {
    const key = cityKey(state, city);
    if (!key) return null;
    const counts = this.votes.get(key);
    if (!counts) return null;
    let best: string | null = null;
    let bestCount = 0;
    for (const [fips, count] of counts) {
      if (count > bestCount) {
        best = fips;
        bestCount = count;
      }
    }
    return best;
  }

  size(): number {
    return this.votes.size;
  }
}
