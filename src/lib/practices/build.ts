import { digitsOnly } from '../nppes/normalize';
import { looksLikePersonListing } from '../places/score';
import { foldListings } from '../ingest/attach';
import { namedAsReferralPractice } from '../places/discover';
import {
  addressClusterKey,
  assignDuplicateClusters,
  placeClusterKey,
  type ClusterInput,
} from '../ingest/duplicates';

/**
 * Referral source formation.
 *
 * The practices Google lists in the county come first: each is a row, named
 * as Google names it, and the NPI records attached to it nest under it, with
 * the fax taken from their NPI registrations. That is how a health system's
 * clinic, which has no organization NPI of its own, still appears as one
 * practice with its physicians under it.
 *
 * NPI records attached to no listing fall back to the older rules: an
 * organization NPI (NPI-2) at an address groups the providers there; a
 * provider with nothing to group under is listed on their own. No practice is
 * ever named after its street.
 */

export interface PlaceRow {
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  countyName: string | null;
  countyFips: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  personal: boolean;
  types?: string[];
}

export interface PracticeSourceRow {
  id: string;
  npiNumber: string | null;
  name: string;
  enumerationType: string | null;
  primaryTaxonomyCode: string | null;
  taxonomyCodes: string[];
  sourceType: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  countyName: string | null;
  countyFips: string | null;
  contactPhone: string | null;
  faxNumber: string | null;
  placeId: string | null;
  placeName?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
}

export interface BuiltProvider {
  sourceId: string;
  npiNumber: string | null;
  name: string;
  primaryTaxonomyCode: string | null;
  taxonomyCodes: string[];
  sourceType: string | null;
  faxNumber: string | null;
}

export type PracticeFormedBy = 'organization' | 'listing' | 'provider';

export interface BuiltPractice {
  /** Stable identity for this location. */
  practiceKey: string;
  placeId: string | null;
  /** Business name on the Google Places listing, when matched. */
  placeName: string | null;
  /** What named this row: an org NPI, the shared Places listing, or the one provider on it. */
  formedBy: PracticeFormedBy;
  name: string;
  /** True when several org NPIs sit here and the name had to be chosen. */
  nameAmbiguous: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  countyName: string | null;
  countyFips: string | null;
  phone: string | null;
  faxNumber: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  orgNpis: string[];
  providers: BuiltProvider[];
  /** NPI-1 members only. An org-only location is 0 and is not an estimate of 0. */
  providerCount: number;
  /** Source type to count, for the referral estimate's drivers. */
  taxonomyMix: Record<string, number>;
}

function isOrg(row: PracticeSourceRow): boolean {
  return (row.enumerationType ?? '').toUpperCase() === 'NPI-2';
}

/** The value held by the most rows; ties go to the first seen. */
function modal(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function practiceKeyFor(row: PracticeSourceRow, clusterKey: string | null): string {
  return (
    clusterKey
    ?? placeClusterKey(row.placeId)
    ?? addressClusterKey(row.address, row.zipCode, row.city)
    ?? `npi:${row.npiNumber ?? row.id}`
  );
}

function sameOrg(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(inc|llc|pllc|pa|pc|corp|ltd)\b/g, '').trim();
}

/**
 * Pick the practice name. An org NPI at the location names it; several org
 * NPIs with one name (a health center registered three times) still do.
 * Different org names mean two practices may share an address, so prefer the
 * one whose fax matches the practice fax and mark the name ambiguous.
 */
function practiceName(orgs: PracticeSourceRow[], fax: string | null): {
  name: string;
  ambiguous: boolean;
} {
  const distinct = new Map<string, PracticeSourceRow>();
  for (const org of orgs) if (!distinct.has(sameOrg(org.name))) distinct.set(sameOrg(org.name), org);
  if (distinct.size === 1) return { name: [...distinct.values()][0].name, ambiguous: false };
  if (distinct.size > 1) {
    const faxDigits = digitsOnly(fax ?? '').slice(-10);
    const matching = faxDigits
      ? orgs.filter((org) => digitsOnly(org.faxNumber ?? '').slice(-10) === faxDigits)
      : [];
    const chosen = matching.length === 1
      ? matching[0]
      : [...orgs].sort((left, right) => left.name.localeCompare(right.name))[0];
    return { name: chosen.name, ambiguous: true };
  }
  throw new Error('practiceName needs at least one organization');
}

/**
 * The listing name for a location. Members may have matched different Google
 * listings at one address (the clinic, and a physician's own); the clinic's
 * name is the one to use, so listings in a member's name are set aside unless
 * they are all there is.
 */
function listingName(members: PracticeSourceRow[]): string | null {
  const people = members.filter((row) => !isOrg(row)).map((row) => row.name);
  const tally = new Map<string, { count: number; reviews: number; personal: boolean }>();
  for (const row of members) {
    const name = row.placeName?.trim();
    if (!name) continue;
    const entry = tally.get(name) ?? { count: 0, reviews: 0, personal: looksLikePersonListing(name, people) };
    entry.count += 1;
    entry.reviews = Math.max(entry.reviews, row.reviewCount ?? 0);
    tally.set(name, entry);
  }
  // The clinic's listing over a person's; then the one most members matched; then the one people review.
  const ranked = [...tally.entries()].sort(([, left], [, right]) => {
    if (left.personal !== right.personal) return left.personal ? 1 : -1;
    if (left.count !== right.count) return right.count - left.count;
    return right.reviews - left.reviews;
  });
  return ranked[0]?.[0] ?? null;
}

/** The member whose Places listing has the most reviews; that is the one people see. */
function bestListing(rows: PracticeSourceRow[]): PracticeSourceRow | null {
  let best: PracticeSourceRow | null = null;
  for (const row of rows) {
    if (row.rating == null) continue;
    if (!best || (row.reviewCount ?? 0) > (best.reviewCount ?? 0)) best = row;
  }
  return best;
}

/**
 * One provider as their own referral source. A colleague at the same location
 * may have registered the fax this provider left blank, so the row borrows it.
 */
function soloPractice(row: PracticeSourceRow, locationFax: string | null): BuiltPractice {
  return {
    practiceKey: `npi:${row.npiNumber ?? row.id}`,
    placeId: row.placeId,
    // Their own listing says nothing a person does not already see from the name.
    placeName: row.placeName && !looksLikePersonListing(row.placeName, [row.name]) ? row.placeName : null,
    formedBy: 'provider',
    name: row.name,
    nameAmbiguous: false,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    countyName: row.countyName,
    countyFips: row.countyFips,
    phone: row.contactPhone,
    faxNumber: row.faxNumber ?? locationFax,
    website: row.website ?? null,
    rating: row.rating ?? null,
    reviewCount: row.reviewCount ?? null,
    orgNpis: [],
    providers: [providerOf(row)],
    providerCount: 1,
    taxonomyMix: { [row.sourceType ?? 'unknown']: 1 },
  };
}

function providerOf(row: PracticeSourceRow): BuiltProvider {
  return {
    sourceId: row.id,
    npiNumber: row.npiNumber,
    name: row.name,
    primaryTaxonomyCode: row.primaryTaxonomyCode,
    taxonomyCodes: row.taxonomyCodes,
    sourceType: row.sourceType,
    faxNumber: row.faxNumber,
  };
}

function mixOf(people: PracticeSourceRow[]): Record<string, number> {
  const taxonomyMix: Record<string, number> = {};
  for (const person of people) {
    const key = person.sourceType ?? 'unknown';
    taxonomyMix[key] = (taxonomyMix[key] ?? 0) + 1;
  }
  return taxonomyMix;
}

/** A practice Google lists, with the NPI records attached to it under it. */
function listedPractice(place: PlaceRow, members: PracticeSourceRow[]): BuiltPractice {
  const orgs = members.filter(isOrg);
  const people = members.filter((row) => !isOrg(row));
  return {
    practiceKey: `place:${place.placeId}`,
    placeId: place.placeId,
    placeName: place.name,
    formedBy: 'listing',
    name: place.name,
    nameAmbiguous: false,
    address: place.address ?? modal(members.map((row) => row.address)),
    city: place.city ?? modal(members.map((row) => row.city)),
    state: place.state ?? modal(members.map((row) => row.state)),
    zipCode: place.zipCode ?? modal(members.map((row) => row.zipCode)),
    countyName: place.countyName ?? modal(members.map((row) => row.countyName)),
    countyFips: place.countyFips ?? modal(members.map((row) => row.countyFips)),
    phone: place.phone ?? modal(members.map((row) => row.contactPhone)),
    // Google does not publish fax numbers; NPI registrations here do.
    faxNumber: modal([...orgs, ...people].map((row) => row.faxNumber)),
    website: place.website ?? modal(members.map((row) => row.website ?? null)),
    rating: place.rating,
    reviewCount: place.reviewCount,
    orgNpis: orgs.map((row) => row.npiNumber).filter((npi): npi is string => Boolean(npi)),
    providers: people.map(providerOf),
    providerCount: people.length,
    taxonomyMix: mixOf(people),
  };
}

/**
 * Rows, in order: each practice Google lists that has a pediatrician or
 * family physician from NPI under it, or that Google names as that kind of
 * practice; then the NPI providers no listing claims. An organization record
 * alone does not make a row: a rural health clinic code is on urgent cares
 * and health departments too, so it names and faxes a practice but does not
 * decide that one is there.
 */
export function buildPractices(rows: PracticeSourceRow[], places: PlaceRow[] = []): BuiltPractice[] {
  const placeById = new Map(places.map((place) => [place.placeId, place]));
  const fold = foldListings(places);
  const attached = new Map<string, PracticeSourceRow[]>();
  const rest: PracticeSourceRow[] = [];
  for (const row of rows) {
    const placeId = row.placeId && placeById.has(row.placeId) ? fold.get(row.placeId) ?? row.placeId : null;
    if (placeId) attached.set(placeId, [...(attached.get(placeId) ?? []), row]);
    else rest.push(row);
  }

  const practices: BuiltPractice[] = [];
  for (const place of places) {
    // A listing that folded into another is not a row of its own.
    if (fold.get(place.placeId) !== place.placeId) continue;
    const members = attached.get(place.placeId) ?? [];
    const hasProvider = members.some((row) => !isOrg(row));
    if (!hasProvider && !namedAsReferralPractice(place.name, place.types ?? [])) {
      // Not a row, but an organization record here still stands on its own below.
      rest.push(...members);
      continue;
    }
    practices.push(listedPractice(place, members));
  }
  return [...practices, ...buildUnlisted(rest)];
}

/** NPI records Google lists nowhere: group under an organization NPI, else stand alone. */
function buildUnlisted(rows: PracticeSourceRow[]): BuiltPractice[] {
  const clusterInputs: ClusterInput[] = rows.map((row) => ({
    id: row.id,
    phone: row.contactPhone,
    placeId: row.placeId,
    address: row.address,
    zipCode: row.zipCode,
    city: row.city,
  }));
  const assignments = new Map(
    assignDuplicateClusters(clusterInputs).map((row) => [row.id, row.duplicateClusterKey]),
  );

  const groups = new Map<string, PracticeSourceRow[]>();
  for (const row of rows) {
    const key = practiceKeyFor(row, assignments.get(row.id) ?? null);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const practices: BuiltPractice[] = [];
  for (const [practiceKey, members] of groups) {
    const orgs = members.filter(isOrg);
    const people = members.filter((row) => !isOrg(row));
    const faxNumber = modal(members.map((row) => row.faxNumber));
    const placeName = listingName(members);

    let name: string;
    let ambiguous = false;
    let formedBy: PracticeFormedBy;
    if (orgs.length > 0 && people.length === 0) {
      // An organization record with no provider here is not a referral source by itself.
      continue;
    }
    if (orgs.length > 0) {
      ({ name, ambiguous } = practiceName(orgs, faxNumber));
      formedBy = 'organization';
    } else if (people.length > 1 && placeName) {
      // No org NPI here, but Google lists the clinic these providers share.
      name = placeName;
      formedBy = 'listing';
    } else {
      // Nothing real to name a group: each provider stands alone.
      for (const person of people) practices.push(soloPractice(person, faxNumber));
      continue;
    }
    const listing = bestListing(members);
    const taxonomyMix = mixOf(people);

    practices.push({
      practiceKey,
      placeId: modal(members.map((row) => row.placeId)),
      placeName,
      formedBy,
      name,
      nameAmbiguous: ambiguous,
      address: modal(members.map((row) => row.address)),
      city: modal(members.map((row) => row.city)),
      state: modal(members.map((row) => row.state)),
      zipCode: modal(members.map((row) => row.zipCode)),
      countyName: modal(members.map((row) => row.countyName)),
      countyFips: modal(members.map((row) => row.countyFips)),
      phone: modal(members.map((row) => row.contactPhone)),
      faxNumber,
      // Places fields: the org's listing first, else the most common among members.
      website: modal([...orgs, ...people].map((row) => row.website ?? null)),
      rating: listing?.rating ?? null,
      reviewCount: listing?.reviewCount ?? null,
      orgNpis: orgs.map((row) => row.npiNumber).filter((npi): npi is string => Boolean(npi)),
      providers: people.map(providerOf),
      providerCount: people.length,
      taxonomyMix,
    });
  }

  return practices;
}
