/**
 * Matching a subscriber's referral source to the shared catalog: by NPI
 * (a provider's or the organization's), then fax, then phone, then the name
 * (or practice name) in the same ZIP. Pure, over an in-memory index of the
 * catalog, so an upload of hundreds of rows is one read.
 */

export interface CatalogPractice {
  id: string;
  name: string;
  placeName: string | null;
  zipCode: string | null;
  faxNumber: string | null;
  phone: string | null;
  orgNpis: string[];
  providerNpis: string[];
}

export interface CatalogIndex {
  byNpi: Map<string, string>;
  byFax: Map<string, string>;
  byPhone: Map<string, string>;
  byNameZip: Map<string, string>;
}

const digits10 = (value: string | null | undefined) => {
  const d = (value ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};

export function nameKey(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(pa|pllc|llc|inc|pc|md|do|dr|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCatalogIndex(practices: CatalogPractice[]): CatalogIndex {
  const index: CatalogIndex = { byNpi: new Map(), byFax: new Map(), byPhone: new Map(), byNameZip: new Map() };
  const setOnce = (map: Map<string, string>, key: string | null, id: string) => {
    if (key && !map.has(key)) map.set(key, id);
  };
  for (const practice of practices) {
    for (const npi of [...practice.orgNpis, ...practice.providerNpis]) setOnce(index.byNpi, npi, practice.id);
    setOnce(index.byFax, digits10(practice.faxNumber), practice.id);
    setOnce(index.byPhone, digits10(practice.phone), practice.id);
    const zip = (practice.zipCode ?? '').slice(0, 5);
    for (const name of [practice.name, practice.placeName]) {
      const key = nameKey(name);
      if (key && zip) setOnce(index.byNameZip, `${key}|${zip}`, practice.id);
    }
  }
  return index;
}

export function matchToCatalog(
  row: { npi?: string | null; fax?: string | null; phone?: string | null; name: string; practiceName?: string | null; zip?: string | null },
  index: CatalogIndex,
): { practiceId: string; matchedBy: 'npi' | 'fax' | 'phone' | 'name' } | null {
  if (row.npi && index.byNpi.has(row.npi)) return { practiceId: index.byNpi.get(row.npi) as string, matchedBy: 'npi' };
  const fax = digits10(row.fax);
  if (fax && index.byFax.has(fax)) return { practiceId: index.byFax.get(fax) as string, matchedBy: 'fax' };
  const phone = digits10(row.phone);
  if (phone && index.byPhone.has(phone)) return { practiceId: index.byPhone.get(phone) as string, matchedBy: 'phone' };
  const zip = (row.zip ?? '').slice(0, 5);
  if (zip) {
    for (const name of [row.practiceName, row.name]) {
      const key = nameKey(name);
      if (key && index.byNameZip.has(`${key}|${zip}`)) return { practiceId: index.byNameZip.get(`${key}|${zip}`) as string, matchedBy: 'name' };
    }
  }
  return null;
}
