import { ACQUISITION_TAXONOMIES } from '../nppes/taxonomies';
import { npiGroups, type PracticeSourceRow } from '../practices/build';

/**
 * Therapy practices in a county from NPI records, grouped the same way the
 * referral catalog groups providers: under an organization NPI at their
 * address, else by the address they share; a therapist alone is a lead of
 * their own (a private practice owner). Never named after a street.
 */

export interface LeadRecord {
  npi: string;
  name: string;
  entityType: string;
  primaryTaxonomyCode: string | null;
  address1: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  fax: string | null;
}

export { CO_STAGES } from './stages';

export interface BuiltLead {
  key: string;
  name: string;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  phone: string | null;
  faxNumber: string | null;
  orgNpis: string[];
  therapists: { pt: number; ot: number; st: number };
  pediatric: boolean;
}

const byCode = new Map(ACQUISITION_TAXONOMIES.map((row) => [row.code, row]));

function modal(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

export function buildLeads(records: LeadRecord[]): BuiltLead[] {
  const rows: PracticeSourceRow[] = records.map((record) => ({
    id: record.npi,
    npiNumber: record.npi,
    name: record.name,
    enumerationType: record.entityType === '2' ? 'NPI-2' : 'NPI-1',
    primaryTaxonomyCode: record.primaryTaxonomyCode,
    taxonomyCodes: record.primaryTaxonomyCode ? [record.primaryTaxonomyCode] : [],
    sourceType: record.primaryTaxonomyCode ? byCode.get(record.primaryTaxonomyCode)?.discipline ?? null : null,
    address: record.address1,
    city: record.city,
    state: null,
    zipCode: record.zip,
    countyName: null,
    countyFips: null,
    contactPhone: record.phone,
    faxNumber: record.fax,
    placeId: null,
  }));
  const leads: BuiltLead[] = [];
  for (const group of npiGroups(rows)) {
    const orgs = group.members.filter((row) => row.enumerationType === 'NPI-2');
    const people = group.members.filter((row) => row.enumerationType !== 'NPI-2');
    const therapists = { pt: 0, ot: 0, st: 0 };
    let pediatric = 0;
    for (const person of people) {
      const code = person.primaryTaxonomyCode ? byCode.get(person.primaryTaxonomyCode) : undefined;
      if (code && code.discipline !== 'clinic') therapists[code.discipline] += 1;
      if (code?.pediatric) pediatric += 1;
    }
    const name = orgs.length > 0
      ? titleCase(orgs[0].name)
      : people.length === 1
        ? titleCase(people[0].name)
        : `${titleCase(people[0].name)} and ${people.length - 1} other therapist${people.length === 2 ? '' : 's'}`;
    const orgNpis = orgs.map((row) => row.npiNumber as string).sort();
    leads.push({
      key: orgNpis.length > 0 ? `org:${orgNpis[0]}` : people.length === 1 ? `npi:${people[0].npiNumber}` : group.key,
      name,
      address: modal(group.members.map((row) => row.address)),
      city: modal(group.members.map((row) => row.city)),
      zipCode: modal(group.members.map((row) => row.zipCode)),
      phone: modal(group.members.map((row) => row.contactPhone)),
      faxNumber: modal(group.members.map((row) => row.faxNumber)),
      orgNpis,
      therapists,
      pediatric: pediatric > 0 || /pediatric|kids|children|child/i.test(name),
    });
  }
  return leads.sort((left, right) => {
    const size = (lead: BuiltLead) => lead.therapists.pt + lead.therapists.ot + lead.therapists.st;
    return size(right) - size(left) || left.name.localeCompare(right.name);
  });
}
