import { digitsOnly } from '../nppes/normalize';
import {
  addressClusterKey,
  assignDuplicateClusters,
  placeClusterKey,
  type ClusterInput,
} from '../ingest/duplicates';

/**
 * Practice formation.
 *
 * A practice is a location, not an organization. NPPES does not link an
 * individual to their employer's org NPI, most practices in a county pull have
 * no NPI-2 at all, one org NPI can span several addresses, and one address can
 * host several org NPIs. So identity comes from the location and any org NPIs
 * are recorded as attributes of it.
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

/**
 * Pick the practice name. A single org NPI at the location names it. Several
 * org NPIs means two practices may share an address, so prefer the one whose
 * fax matches the practice fax and mark the name ambiguous.
 */
function practiceName(orgs: PracticeSourceRow[], members: PracticeSourceRow[], fax: string | null): {
  name: string;
  ambiguous: boolean;
} {
  if (orgs.length === 1) return { name: orgs[0].name, ambiguous: false };
  if (orgs.length > 1) {
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
