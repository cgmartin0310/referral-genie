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
