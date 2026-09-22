import { digitsOnly } from '../nppes/normalize';
import {
  addressClusterKey,
  assignDuplicateClusters,
  placeClusterKey,
  type ClusterInput,
} from '../ingest/duplicates';

/**
 * Referral source formation.
 *
 * Providers at a location that has an organization NPI (NPI-2) are grouped
 * under it: the org record carries the practice name and fax. Providers at a
 * location with no organization NPI are listed individually, each as a
 * referral source of one, rather than grouped under a made-up name. Identity
 * of a group comes from the location (place id, else street and town), since
 * NPPES does not link an individual to an employer.
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

export interface BuiltPractice {
  /** Stable identity for this location. */
  practiceKey: string;
  placeId: string | null;
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
 * one whose fax matches the practice fax and mark the name ambiguous. With no
 * org NPI, the Google Places listing names it; the street is the last resort.
 */
function practiceName(orgs: PracticeSourceRow[], members: PracticeSourceRow[], fax: string | null): {
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
  const address = modal(members.map((row) => row.address));
  return { name: address ?? members[0]?.name ?? 'Unnamed practice', ambiguous: false };
}

/** One provider as their own referral source. */
function soloPractice(row: PracticeSourceRow): BuiltPractice {
  return {
    practiceKey: `npi:${row.npiNumber ?? row.id}`,
    placeId: row.placeId,
    name: row.name,
    nameAmbiguous: false,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    countyName: row.countyName,
    countyFips: row.countyFips,
    phone: row.contactPhone,
    faxNumber: row.faxNumber,
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
    if (orgs.length === 0) {
      // No organization here to group under: each provider stands alone.
      for (const person of people) practices.push(soloPractice(person));
      continue;
    }
    const faxNumber = modal(members.map((row) => row.faxNumber));
    const { name, ambiguous } = practiceName(orgs, members, faxNumber);

    const taxonomyMix: Record<string, number> = {};
    for (const person of people) {
      const key = person.sourceType ?? 'unknown';
      taxonomyMix[key] = (taxonomyMix[key] ?? 0) + 1;
    }

    practices.push({
      practiceKey,
      placeId: modal(members.map((row) => row.placeId)),
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
