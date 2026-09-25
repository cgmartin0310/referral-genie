import { digitsOnly } from '../nppes/normalize';
import { attachSources, type AttachPlace } from '../ingest/attach';
import { listingNamesPerson } from '../places/score';
import {
  addressClusterKey,
  assignDuplicateClusters,
  baseAddressKey,
  type ClusterInput,
} from '../ingest/duplicates';

/**
 * Referral source formation, NPI first.
 *
 * 1. Organization NPIs (type 2), with the providers (type 1) at their
 *    address nested under them.
 * 2. Providers with no organization at their address, grouped by the
 *    address they share.
 * 3. Providers alone at an address.
 *
 * Google Places then names and enriches each group: the listing its
 * members match (their own listing's clinic, else one at their site on
 * their phone). Groups that match the same listing are one practice and
 * merge. An organization with no provider under it is not a row.
 *
 * The fax is the one the group's NPI records agree on (a location fax, else a
 * mailing-address fax in the same town); Google publishes none.
 * Address identity comes from the street and town (suite when both give
 * one), with a shared phone settling spelling variants; a phone alone never
 * joins two addresses.
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
  mailingFax?: string | null;
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
  /** Stable identity: the organization NPI, else the Google listing, else the address or the one provider. */
  practiceKey: string;
  placeId: string | null;
  /** Business name on the Google Places listing, when matched. */
  placeName: string | null;
  /** What named this row: an org NPI, the Google listing, or the one provider on it. */
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
  providerCount: number;
  /** Source type to count, for the referral estimate's drivers. */
  taxonomyMix: Record<string, number>;
  /** Source ids here, for writing the listing back onto them. */
  memberIds: string[];
}

function isOrg(row: PracticeSourceRow): boolean {
  return (row.enumerationType ?? '').toUpperCase() === 'NPI-2';
}

/** The value held by the most rows; ties go to the first seen. */
function modal(values: (string | null | undefined)[]): string | null {
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

function sameOrg(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(inc|llc|pllc|pa|pc|corp|ltd)\b/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Pick the name among the organizations at one practice. One name registered
 * several times still names it. Different names mean two practices may share
 * the address, so prefer the one whose fax matches the practice fax and mark
 * the name ambiguous.
 */
function orgName(orgs: PracticeSourceRow[], fax: string | null): { name: string; ambiguous: boolean } {
  const distinct = new Map<string, PracticeSourceRow>();
  for (const org of orgs) if (!distinct.has(sameOrg(org.name))) distinct.set(sameOrg(org.name), org);
  if (distinct.size === 1) return { name: [...distinct.values()][0].name, ambiguous: false };
  const faxDigits = digitsOnly(fax ?? '').slice(-10);
  const matching = faxDigits ? orgs.filter((org) => digitsOnly(org.faxNumber ?? '').slice(-10) === faxDigits) : [];
  const chosen = matching.length === 1
    ? matching[0]
    : [...orgs].sort((left, right) => left.name.localeCompare(right.name))[0];
  return { name: chosen.name, ambiguous: true };
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

/** Steps 1 to 3: NPI records grouped by the address they share. */
export function npiGroups(rows: PracticeSourceRow[]): { key: string; members: PracticeSourceRow[] }[] {
  const clusterInputs: ClusterInput[] = rows.map((row) => ({
    id: row.id,
    phone: row.contactPhone,
    // NPI decides the groups; Google only names them afterwards.
    placeId: null,
    address: row.address,
    zipCode: row.zipCode,
    city: row.city,
  }));
  const assignments = new Map(
    assignDuplicateClusters(clusterInputs).map((row) => [row.id, row.duplicateClusterKey]),
  );
  const groups = new Map<string, PracticeSourceRow[]>();
  for (const row of rows) {
    const key = assignments.get(row.id)
      ?? addressClusterKey(row.address, row.zipCode, row.city)
      ?? `npi:${row.npiNumber ?? row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, members]) => ({ key, members }));
}

class UnionFind {
  private parent = new Map<number, number>();
  find(id: number): number {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }
  union(left: number, right: number) {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent.set(b, a);
  }
}

/** The listing most of a group's members matched; ties go to the one people review. */
function groupListing(
  members: PracticeSourceRow[],
  listingBySource: Map<string, string>,
  placeById: Map<string, PlaceRow>,
): string | null {
  const counts = new Map<string, number>();
  for (const row of members) {
    const placeId = listingBySource.get(row.id);
    if (placeId) counts.set(placeId, (counts.get(placeId) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [placeId, count] of counts) {
    if (!best) {
      best = placeId;
      continue;
    }
    const bestCount = counts.get(best) ?? 0;
    const reviews = placeById.get(placeId)?.reviewCount ?? 0;
    const bestReviews = placeById.get(best)?.reviewCount ?? 0;
    if (count > bestCount || (count === bestCount && reviews > bestReviews)) best = placeId;
  }
  return best;
}

/**
 * Organization names that stand for a health system rather than a practice:
 * the same name registered at more than one address in the county ("University
 * of North Carolina Hospitals at Chapel Hill" at four sites). Google's name
 * for each site says more.
 */
function systemNames(rows: PracticeSourceRow[]): Set<string> {
  const sites = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!isOrg(row)) continue;
    const site = baseAddressKey(row.address, row.zipCode, row.city) ?? row.id;
    const key = sameOrg(row.name);
    sites.set(key, (sites.get(key) ?? new Set()).add(site));
  }
  return new Set([...sites].filter(([, set]) => set.size > 1).map(([key]) => key));
}

export function buildPractices(rows: PracticeSourceRow[], places: PlaceRow[] = []): BuiltPractice[] {
  const placeById = new Map(places.map((place) => [place.placeId, place]));
  const attachPlaces: AttachPlace[] = places.map((place) => ({
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    city: place.city,
    zipCode: place.zipCode,
    phone: place.phone,
    website: place.website,
    reviewCount: place.reviewCount,
    personal: place.personal,
  }));
  const groups = npiGroups(rows);
  const attachInputs = rows.map((row) => ({
    id: row.id,
    name: isOrg(row) ? null : row.name,
    address: row.address,
    city: row.city,
    zipCode: row.zipCode,
    phone: row.contactPhone,
  }));
  // A person alone may follow their own listing elsewhere in the county (an
  // old NPI address); members of a group stay bound to the group's address.
  const alone = new Set(groups.filter((group) => group.members.length === 1).map((group) => group.members[0].id));
  const followed = attachSources(attachInputs.filter((row) => alone.has(row.id)), attachPlaces, { followElsewhere: true });
  const bound = attachSources(attachInputs.filter((row) => !alone.has(row.id)), attachPlaces, { followElsewhere: false });
  const listingBySource = new Map([...followed, ...bound]);

  // Groups that match the same Google listing are one practice: an
  // organization and its providers written at two suites, or a building
  // listed under two street spellings.
  const listings = groups.map((group) => groupListing(group.members, listingBySource, placeById));
  const uf = new UnionFind();
  const firstByListing = new Map<string, number>();
  listings.forEach((placeId, index) => {
    if (!placeId) return;
    const first = firstByListing.get(placeId);
    if (first === undefined) firstByListing.set(placeId, index);
    else uf.union(first, index);
  });
  const merged = new Map<number, { keys: string[]; members: PracticeSourceRow[] }>();
  groups.forEach((group, index) => {
    const root = uf.find(index);
    const entry = merged.get(root) ?? { keys: [], members: [] };
    entry.keys.push(group.key);
    entry.members.push(...group.members);
    merged.set(root, entry);
  });

  const systems = systemNames(rows);
  const practices: BuiltPractice[] = [];
  for (const [root, unit] of merged) {
    const members = unit.members;
    const people = members.filter((row) => !isOrg(row));
    // An organization with no provider under it is not a referral source.
    if (people.length === 0) continue;
    const orgs = members.filter(isOrg);
    const matchedId = listings[root] ?? groupListing(members, listingBySource, placeById);
    const matched = matchedId ? placeById.get(matchedId) ?? null : null;
    // A clinician's own listing stands for a practice only when it is one of
    // the people here; another doctor's listing in the same hospital is not
    // this practice's name.
    const place = matched && matched.personal && !people.some((person) => listingNamesPerson(matched.name, person.name))
      ? null
      : matched;
    const placeId = place?.placeId ?? null;
    // A location fax first. Only when no one here lists one does NPI's
    // mailing-address fax stand in (it is kept only for mail to this town).
    const faxNumber = modal(members.map((row) => row.faxNumber)) ?? modal(members.map((row) => row.mailingFax));

    const practiceOrgs = orgs.filter((org) => !systems.has(sameOrg(org.name)));
    let name: string;
    let ambiguous = false;
    let formedBy: PracticeFormedBy;
    if (practiceOrgs.length > 0) {
      ({ name, ambiguous } = orgName(practiceOrgs, faxNumber));
      formedBy = 'organization';
    } else if (place) {
      name = place.name;
      formedBy = 'listing';
    } else if (orgs.length > 0) {
      ({ name, ambiguous } = orgName(orgs, faxNumber));
      formedBy = 'organization';
    } else if (people.length === 1) {
      name = people[0].name;
      formedBy = 'provider';
    } else {
      name = `${people[0].name} and ${people.length - 1} other${people.length === 2 ? '' : 's'}`;
      formedBy = 'provider';
    }

    const orgNpis = orgs.map((row) => row.npiNumber).filter((npi): npi is string => Boolean(npi)).sort();
    const practiceKey = orgNpis.length > 0
      ? `org:${orgNpis[0]}`
      : people.length === 1
        ? `npi:${people[0].npiNumber ?? people[0].id}`
        : placeId
          ? `place:${placeId}`
          : [...unit.keys].sort()[0];

    practices.push({
      practiceKey,
      placeId,
      placeName: place?.name ?? null,
      formedBy,
      name,
      nameAmbiguous: ambiguous,
      address: place?.address ?? modal(members.map((row) => row.address)),
      city: place?.city ?? modal(members.map((row) => row.city)),
      state: place?.state ?? modal(members.map((row) => row.state)),
      zipCode: place?.zipCode ?? modal(members.map((row) => row.zipCode)),
      countyName: modal(members.map((row) => row.countyName)) ?? place?.countyName ?? null,
      countyFips: modal(members.map((row) => row.countyFips)) ?? place?.countyFips ?? null,
      phone: place?.phone ?? modal(members.map((row) => row.contactPhone)),
      faxNumber,
      website: place?.website ?? modal(members.map((row) => row.website)),
      rating: place?.rating ?? null,
      reviewCount: place?.reviewCount ?? null,
      orgNpis,
      providers: people.map(providerOf),
      providerCount: people.length,
      taxonomyMix: mixOf(people),
      memberIds: members.map((row) => row.id),
    });
  }
  return practices;
}
