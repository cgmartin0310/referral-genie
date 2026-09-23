import { digitsOnly } from '../nppes/normalize';

export interface PlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string;
  phone?: string | null;
  businessStatus?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface PracticeQuery {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  /** An individual (NPI-1). Their clinic's listing is preferred over one in their own name. */
  isPerson?: boolean;
  /** Words a listing for this kind of practice tends to carry; see specialtyHints. */
  specialty?: string[];
}

const SPECIALTY_HINTS: Record<string, string[]> = {
  pediatrics: ['pediatric', 'children'],
  pcp_family_medicine: ['family', 'primary care'],
  pcp_general_practice: ['primary care', 'general practice', 'family'],
  clinic_center: ['health center', 'community health', 'clinic'],
};

/** Listing-name words that mark a practice of this source type. */
export function specialtyHints(sourceType: string | null | undefined): string[] {
  return (sourceType && SPECIALTY_HINTS[sourceType]) || [];
}

export function namesSpecialty(name: string, hints: string[] | undefined): boolean {
  const lower = name.toLowerCase();
  return (hints ?? []).some((hint) => lower.includes(hint));
}

const NAME_STOP = new Set([
  'md', 'do', 'dr', 'inc', 'llc', 'pa', 'pc', 'pllc', 'the', 'and', 'of', 'clinic', 'practice',
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !NAME_STOP.has(token));
}

const CREDENTIALS = new Set([
  'md', 'do', 'dr', 'jr', 'sr', 'ii', 'iii', 'phd', 'np', 'fnp', 'pa', 'pac', 'dds', 'dmd', 'faap', 'facp', 'aprn', 'cnp',
]);

function rawTokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * A Google listing in a person's name rather than the clinic's: "Carl L
 * Haynes Jr., MD" beside "ECU Health Family Medicine - La Grange". It carries
 * a credential, or it is mostly one of the people given.
 */
export function looksLikePersonListing(name: string, people: string[] = []): boolean {
  const raw = rawTokens(name);
  if (raw.some((token) => CREDENTIALS.has(token))) return true;
  const listing = new Set(tokens(name));
  if (listing.size === 0) return false;
  for (const person of people) {
    const personTokens = new Set(tokens(person).filter((token) => token.length > 2));
    if (personTokens.size === 0) continue;
    let shared = 0;
    for (const token of personTokens) if (listing.has(token)) shared += 1;
    if (shared >= Math.min(2, personTokens.size) && shared / listing.size >= 0.5) return true;
  }
  return false;
}

export function tokenOverlap(left: string, right: string): number {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.min(a.size, b.size);
}

export function phonesMatch(left: string, right: string): boolean {
  const a = digitsOnly(left);
  const b = digitsOnly(right);
  if (a.length < 10 || b.length < 10) return false;
  return a.slice(-10) === b.slice(-10);
}

export function streetNumber(street: string): string | null {
  const match = street.match(/\d+/);
  return match ? match[0] : null;
}

export interface MatchEvaluation {
  accept: boolean;
  confidence: number;
}

/**
 * Accept a Places candidate only with corroboration.
 * A phone hit still needs a zip, street number, or name overlap.
 * An address hit needs the street number, ZIP, and some name overlap.
 */
export function evaluatePlaceMatch(
  input: PracticeQuery,
  candidate: PlaceCandidate,
  options: { phoneQuery: boolean },
): MatchEvaluation {
  const address = candidate.formattedAddress.toLowerCase();
  const zipHit = input.zip.length === 5 && address.includes(input.zip);
  const number = streetNumber(input.street);
  const numberHit = Boolean(number && new RegExp(`\\b${number}\\b`).test(candidate.formattedAddress));
  const phoneHit = options.phoneQuery || phonesMatch(input.phone, candidate.phone ?? '');
  const nameScore = tokenOverlap(input.name, candidate.name);
  const cityHit = input.city.length > 1 && address.includes(input.city.toLowerCase());

  if (phoneHit && zipHit && numberHit) {
    return { accept: true, confidence: 0.95 };
  }
  if (phoneHit && (zipHit || numberHit)) {
    return { accept: true, confidence: 0.86 };
  }
  if (phoneHit && nameScore >= 0.34) {
    return { accept: true, confidence: cityHit ? 0.78 : 0.72 };
  }
  if (zipHit && numberHit && nameScore >= 0.34) {
    return { accept: true, confidence: 0.8 };
  }

  const weak =
    (phoneHit ? 0.4 : 0) +
    (zipHit ? 0.2 : 0) +
    (numberHit ? 0.15 : 0) +
    nameScore * 0.2 +
    (cityHit ? 0.05 : 0);
  return { accept: false, confidence: Math.round(Math.min(0.55, weak) * 100) / 100 };
}
