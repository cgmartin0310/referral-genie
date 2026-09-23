import { countyForZip } from '../npi/county-map';
import type { CountyMarket } from '../nppes/counties';
import { looksLikePersonListing } from './score';

/**
 * Finding the practices in a county on Google Places.
 *
 * The referral source list starts from what Google lists, because a listing
 * is a practice as people know it: one name, one phone, one website. NPI
 * cannot say that; it lists people, and health systems register no
 * organization at their clinics. So the county is searched town by town for
 * the kinds of practice that refer, results outside the county are dropped,
 * and NPI providers are nested under the listings afterwards.
 */

/** What a referral source is, in the words people search Google with. */
export const DISCOVERY_QUERIES = ['pediatrician', 'family medicine', 'primary care'];

/** Google types a medical practice carries. A pharmacy or gym is not one. */
const PRACTICE_TYPES = new Set(['doctor', 'health', 'hospital', 'medical_clinic', 'medical_center']);

/** Google types that mark a business that is not a physician practice, whatever its name. */
const NOT_PHYSICIAN_TYPES = new Set([
  'dentist', 'dental_clinic', 'chiropractor', 'physiotherapist', 'pharmacy', 'drugstore', 'veterinary_care',
  'spa', 'beauty_salon', 'gym', 'optometrist', 'massage', 'wellness_center',
]);

/** Name words that say a listing is the kind of practice the county search looks for. */
const REFERRAL_NAME = /\b(pediatric|pediatrics|children|kids|family (medicine|practice|care|health|physicians?)|primary care|general practice)\b/i;

/**
 * A listing with no pediatrician or family physician on NPI still earns a
 * row when Google names it as that kind of practice and does not type it as
 * something else ("Family Dental" is a dentist).
 */
export function namedAsReferralPractice(name: string, types: string[]): boolean {
  if (notPhysician(types)) return false;
  return REFERRAL_NAME.test(name);
}

/**
 * Typed as a dentist, chiropractor, and the like, and not also as a doctor.
 * A health center with a dental clinic carries both, and is a practice.
 */
function notPhysician(types: string[]): boolean {
  if (types.includes('doctor') || types.includes('hospital')) return false;
  return types.some((type) => NOT_PHYSICIAN_TYPES.has(type));
}

export interface DiscoverySearch {
  town: string;
  query: string;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Where to search: the county itself, then each town in it. Towns come from
 * the county's ZIP list and from the practice cities on the NPI records
 * placed in the county, so a town with practices is always searched.
 */
export function discoveryTowns(county: CountyMarket, npiCities: string[]): string[] {
  const seen = new Set<string>();
  const towns: string[] = [];
  const add = (raw: string) => {
    const town = titleCase(raw.trim().replace(/\s+/g, ' '));
    const key = town.toLowerCase().replace(/[^a-z]/g, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    towns.push(town);
  };
  const countyName = /county|parish|borough/i.test(county.name) ? county.name : `${county.name} County`;
  add(countyName);
  for (const zip of county.zips) if (zip.city) add(zip.city);
  for (const city of npiCities) add(city);
  return towns;
}

export function discoveryPlan(towns: string[]): DiscoverySearch[] {
  const plan: DiscoverySearch[] = [];
  for (const town of towns) for (const query of DISCOVERY_QUERIES) plan.push({ town, query });
  return plan;
}

export function searchText(search: DiscoverySearch, state: string): string {
  return `${search.query} in ${search.town}, ${state}`;
}

export interface ParsedAddress {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** "101 S Carey St, La Grange, NC 28551, USA" into its parts. */
export function parseFormattedAddress(formatted: string): ParsedAddress {
  const parts = formatted.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0 && /^(usa|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length < 2) return { address: parts[0] ?? null, city: null, state: null, zip: null };
  const stateZip = parts.pop() as string;
  const match = stateZip.match(/^([A-Z]{2})\b\s*(\d{5})?/);
  const city = parts.pop() ?? null;
  return {
    address: parts.join(', ') || null,
    city,
    state: match?.[1] ?? null,
    zip: match?.[2] ?? null,
  };
}

export interface DiscoveredCandidate {
  name: string;
  formattedAddress: string;
  types: string[];
}

/**
 * Keep a search result when it is a medical practice whose ZIP the county
 * crosswalk places in this county. Google answers "pediatrician in Pink
 * Hill" with Wilmington when Pink Hill has none; the ZIP test drops those.
 */
export function keepDiscovered(candidate: DiscoveredCandidate, countyFips: string): { keep: boolean; parsed: ParsedAddress } {
  const parsed = parseFormattedAddress(candidate.formattedAddress);
  if (!candidate.types.some((type) => PRACTICE_TYPES.has(type))) return { keep: false, parsed };
  if (notPhysician(candidate.types)) return { keep: false, parsed };
  if (!parsed.zip) return { keep: false, parsed };
  const county = countyForZip(parsed.zip);
  return { keep: county?.fips === countyFips, parsed };
}

/** A listing in a clinician's own name rather than the practice's. */
export function isPersonalListing(name: string): boolean {
  return looksLikePersonListing(name, []);
}
