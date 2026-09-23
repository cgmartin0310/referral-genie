import { digitsOnly } from '../nppes/normalize';
import { looksLikePersonListing } from '../places/score';
import {
  addressClusterKey,
  assignDuplicateClusters,
  placeClusterKey,
  type ClusterInput,
} from '../ingest/duplicates';

/**
 * Referral source formation.
 *
 * Providers at one location form a practice when something real names it:
 * an organization NPI (NPI-2) registered there, or else the Google Places
 * listing the providers share. Health systems register one NPI-2 at the home
 * office and none at their clinics, so the listing is what identifies those.
 * A provider with nothing to group under is listed on their own; no practice
 * is ever named after its street. Identity of a group comes from the location
 * (place id, else street and town), since NPPES does not link an individual
 * to an employer.
 */

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
  const names = members.map((row) => row.placeName ?? null);
  const clinic = names.filter((name) => name && !looksLikePersonListing(name, people));
  return modal(clinic) ?? modal(names);
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
    providers: [
      {
        sourceId: row.id,
        npiNumber: row.npiNumber,
        name: row.name,
        primaryTaxonomyCode: row.primaryTaxonomyCode,
        taxonomyCodes: row.taxonomyCodes,
        sourceType: row.sourceType,
        faxNumber: row.faxNumber,
      },
    ],
    providerCount: 1,
    taxonomyMix: { [row.sourceType ?? 'unknown']: 1 },
  };
}

export function buildPractices(rows: PracticeSourceRow[]): BuiltPractice[] {
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

    const taxonomyMix: Record<string, number> = {};
    for (const person of people) {
      const key = person.sourceType ?? 'unknown';
      taxonomyMix[key] = (taxonomyMix[key] ?? 0) + 1;
    }

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
      providers: people.map((row) => ({
        sourceId: row.id,
        npiNumber: row.npiNumber,
        name: row.name,
        primaryTaxonomyCode: row.primaryTaxonomyCode,
        taxonomyCodes: row.taxonomyCodes,
        sourceType: row.sourceType,
        faxNumber: row.faxNumber,
      })),
      providerCount: people.length,
      taxonomyMix,
    });
  }

  return practices;
}
