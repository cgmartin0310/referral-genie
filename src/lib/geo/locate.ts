import { googlePlacesClient } from '../places/match';

/**
 * Where an address is, through Google Places (the key the county pull
 * already uses). Null without a key, or when Google finds nothing; distance
 * is then simply not shown.
 */
export async function locateAddress(parts: (string | null | undefined)[]): Promise<{ latitude: number; longitude: number } | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const text = parts.map((part) => part?.trim()).filter(Boolean).join(', ');
  if (!apiKey || text.length < 5) return null;
  try {
    const [first] = await googlePlacesClient(apiKey).findPlace(text, 'textquery');
    if (first?.lat == null || first?.lng == null) return null;
    return { latitude: first.lat, longitude: first.lng };
  } catch (error) {
    console.error('Could not locate address:', error instanceof Error ? error.message : error);
    return null;
  }
}


/** A clinic's profile fields from a request body, cleaned. Only fields present are returned. */
export function clinicProfileFrom(body: Record<string, unknown>): {
  disciplines?: string[];
  pediatric?: boolean;
  payersAccepted?: string[];
  acceptingNewPatients?: boolean;
} {
  const list = (value: unknown, max: number) =>
    Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, max)
      : undefined;
  const out: ReturnType<typeof clinicProfileFrom> = {};
  const disciplines = list(body.disciplines, 10);
  if (disciplines) out.disciplines = disciplines.filter((key) => /^[a-z0-9_-]{1,40}$/.test(key));
  const payers = list(body.payersAccepted, 30);
  if (payers) out.payersAccepted = payers.map((payer) => payer.slice(0, 60));
  if (typeof body.pediatric === 'boolean') out.pediatric = body.pediatric;
  if (typeof body.acceptingNewPatients === 'boolean') out.acceptingNewPatients = body.acceptingNewPatients;
  return out;
}
