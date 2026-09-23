import { digitsOnly } from '../nppes/normalize';
import { evaluatePlaceMatch, looksLikePersonListing, namesSpecialty, type PlaceCandidate, type PracticeQuery } from './score';

export class PlacesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlacesConfigError';
  }
}

export class PlacesQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlacesQuotaError';
  }
}

export interface PlaceDetails {
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  name: string;
  formattedAddress: string;
}

export interface PlaceMatch {
  placeId: string;
  /** Business name on the listing. Names a practice with no organization NPI. */
  name?: string | null;
  /** The listing's address as Google formats it, for placing it in a county. */
  formattedAddress?: string | null;
  confidence: number;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  matchedBy: 'phone' | 'address';
}

export interface PlaceClient {
  findPlace: (text: string, inputtype: 'phonenumber' | 'textquery') => Promise<PlaceCandidate[]>;
  placeDetails: (placeId: string) => Promise<PlaceDetails | null>;
}

/** A listing as a text search returns it: a candidate plus what the search page carries. */
export interface SearchResult extends PlaceCandidate {
  types: string[];
  rating: number | null;
  reviewCount: number | null;
}

export interface SearchPage {
  results: SearchResult[];
  /** Google issues the token before it is usable; wait about two seconds. */
  nextPageToken: string | null;
}

export interface DiscoveryClient {
  textSearch: (query: string, pageToken?: string | null) => Promise<SearchPage>;
}

function nationalPhone(phone: string): string | null {
  const digits = digitsOnly(phone);
  if (digits.length < 10) return null;
  return `+1${digits.slice(-10)}`;
}

type Scored = {
  candidate: PlaceCandidate;
  evaluation: { accept: boolean; confidence: number };
  matchedBy: 'phone' | 'address';
  details: PlaceDetails | null;
};

/** How many tied candidates are worth a details call to separate. */
const DETAIL_CANDIDATES = 8;

/**
 * Rank accepted candidates. One clinic phone returns the clinic, each
 * physician's own listing, a sister specialty clinic, and the building's old
 * name, all at the same address and all accepted. The clinic is the referral
 * source: a listing in the person's own name ranks below it, a name that says
 * the specialty ranks above, and the listing people review is the one they use.
 */
function preference(input: PracticeQuery, scored: Scored): number {
  const personal = input.isPerson && looksLikePersonListing(scored.candidate.name, [input.name]);
  const specialty = namesSpecialty(scored.details?.name || scored.candidate.name, input.specialty);
  const reviews = Math.min(scored.details?.reviewCount ?? 0, 100) / 100;
  return scored.evaluation.confidence - (personal ? 0.1 : 0) + (specialty ? 0.05 : 0) + reviews * 0.04;
}

async function pickWinner(
  input: PracticeQuery,
  candidates: PlaceCandidate[],
  matchedBy: 'phone' | 'address',
  client: PlaceClient,
): Promise<Scored | null> {
  const accepted: Scored[] = candidates
    .map((candidate) => ({
      candidate,
      evaluation: evaluatePlaceMatch(input, candidate, { phoneQuery: matchedBy === 'phone' }),
      matchedBy,
      details: null,
    }))
    .filter((scored) => scored.evaluation.accept)
    .sort((left, right) => right.evaluation.confidence - left.evaluation.confidence)
    .slice(0, DETAIL_CANDIDATES);
  if (accepted.length === 0) return null;
  for (const scored of accepted) scored.details = await client.placeDetails(scored.candidate.placeId);
  // Stable sort: ties keep confidence order, then Google's.
  accepted.sort((left, right) => preference(input, right) - preference(input, left));
  return accepted[0];
}

export async function matchPractice(input: PracticeQuery, client: PlaceClient): Promise<PlaceMatch | null> {
  let winner: Scored | null = null;

  const phone = nationalPhone(input.phone);
  if (phone) {
    winner = await pickWinner(input, await client.findPlace(phone, 'phonenumber'), 'phone', client);
  }

  if (!winner) {
    const text = [input.name, input.street, input.city, input.state, input.zip].filter(Boolean).join(' ');
    winner = await pickWinner(input, await client.findPlace(text, 'textquery'), 'address', client);
  }

  if (!winner) return null;

  const details = winner.details;
  let confidence = winner.evaluation.confidence;
  if (details?.phone && winner.matchedBy === 'address') {
    const withPhone = evaluatePlaceMatch(
      input,
      { ...winner.candidate, phone: details.phone },
      { phoneQuery: false },
    );
    if (withPhone.accept && withPhone.confidence > confidence) confidence = withPhone.confidence;
  }

  return {
    placeId: winner.candidate.placeId,
    name: details?.name || winner.candidate.name || null,
    formattedAddress: details?.formattedAddress || winner.candidate.formattedAddress || null,
    confidence,
    phone: details?.phone ?? null,
    website: details?.website ?? null,
    rating: details?.rating ?? null,
    reviewCount: details?.reviewCount ?? null,
    businessStatus: details?.businessStatus ?? winner.candidate.businessStatus ?? null,
    latitude: details?.latitude ?? winner.candidate.lat ?? null,
    longitude: details?.longitude ?? winner.candidate.lng ?? null,
    matchedBy: winner.matchedBy,
  };
}

const FIND_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const TEXT_SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.location',
  'nextPageToken',
].join(',');

interface TextSearchResponse {
  error?: { message?: string };
  nextPageToken?: string;
  places?: {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    types?: string[];
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    location?: { latitude?: number; longitude?: number };
  }[];
}

const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

interface FindResponse {
  status?: string;
  error_message?: string;
  candidates?: {
    place_id?: string;
    name?: string;
    formatted_address?: string;
    business_status?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }[];
}

interface DetailsResponse {
  status?: string;
  error_message?: string;
  result?: {
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    business_status?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  };
}

function throwForStatus(status: string | undefined, errorMessage: string | undefined, fallback: string): void {
  if (status === 'REQUEST_DENIED' || status === 'INVALID_REQUEST') {
    throw new PlacesConfigError(errorMessage || fallback);
  }
  if (status === 'OVER_QUERY_LIMIT') {
    throw new PlacesQuotaError(errorMessage || 'Google Places quota exceeded');
  }
}

export function googlePlacesClient(apiKey: string): PlaceClient & DiscoveryClient {
  // Every provider at a clinic gets the same candidates back; details are fetched once each.
  const detailsMemo = new Map<string, PlaceDetails | null>();
  const DETAILS_MEMO_MAX = 2000;
  return {
    async textSearch(query, pageToken) {
      // The newer Places API: its page tokens work at once, where the older
      // text search's tokens are refused on this key however long one waits.
      const response = await fetch(TEXT_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': TEXT_SEARCH_FIELDS,
        },
        body: JSON.stringify({ textQuery: query, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as TextSearchResponse;
      if (!response.ok) {
        const message = body.error?.message || `Places search HTTP ${response.status}`;
        if (response.status === 429) throw new PlacesQuotaError(message);
        if (response.status === 400 || response.status === 403) throw new PlacesConfigError(message);
        throw new Error(message);
      }
      return {
        results: (body.places ?? [])
          .filter((row) => row.id)
          .map((row) => ({
            placeId: row.id as string,
            name: row.displayName?.text ?? '',
            formattedAddress: row.formattedAddress ?? '',
            businessStatus: row.businessStatus ?? null,
            lat: row.location?.latitude ?? null,
            lng: row.location?.longitude ?? null,
            types: row.types ?? [],
            rating: typeof row.rating === 'number' ? row.rating : null,
            reviewCount: typeof row.userRatingCount === 'number' ? row.userRatingCount : null,
          })),
        nextPageToken: body.nextPageToken ?? null,
      };
    },
    async findPlace(text, inputtype) {
      const url = new URL(FIND_URL);
      url.searchParams.set('input', text);
      url.searchParams.set('inputtype', inputtype);
      url.searchParams.set('fields', 'place_id,name,formatted_address,geometry,business_status');
      url.searchParams.set('key', apiKey);
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Places find HTTP ${response.status}`);
      const body = (await response.json()) as FindResponse;
      if (body.status === 'ZERO_RESULTS') return [];
      if (body.status !== 'OK') {
        throwForStatus(body.status, body.error_message, 'Google Places find was denied');
        throw new Error(`Places find failed: ${body.status ?? 'unknown'}`);
      }
      return (body.candidates ?? [])
        .filter((row) => row.place_id)
        .map((row) => ({
          placeId: row.place_id as string,
          name: row.name ?? '',
          formattedAddress: row.formatted_address ?? '',
          businessStatus: row.business_status ?? null,
          lat: row.geometry?.location?.lat ?? null,
          lng: row.geometry?.location?.lng ?? null,
        }));
    },
    async placeDetails(placeId) {
      if (detailsMemo.has(placeId)) return detailsMemo.get(placeId) ?? null;
      const details = await fetchDetails(placeId);
      if (detailsMemo.size >= DETAILS_MEMO_MAX) detailsMemo.clear();
      detailsMemo.set(placeId, details);
      return details;
    },
  };

  async function fetchDetails(placeId: string): Promise<PlaceDetails | null> {
    {
      const url = new URL(DETAILS_URL);
      url.searchParams.set('place_id', placeId);
      url.searchParams.set(
        'fields',
        'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status,geometry',
      );
      url.searchParams.set('key', apiKey);
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Places details HTTP ${response.status}`);
      const body = (await response.json()) as DetailsResponse;
      if (body.status !== 'OK' || !body.result) {
        throwForStatus(body.status, body.error_message, 'Google Places details was denied');
        return null;
      }
      const result = body.result;
      return {
        phone: result.formatted_phone_number ?? result.international_phone_number ?? null,
        website: result.website ?? null,
        rating: typeof result.rating === 'number' ? result.rating : null,
        reviewCount: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : null,
        businessStatus: result.business_status ?? null,
        latitude: result.geometry?.location?.lat ?? null,
        longitude: result.geometry?.location?.lng ?? null,
        name: result.name ?? '',
        formattedAddress: result.formatted_address ?? '',
      };
    }
  }
}
