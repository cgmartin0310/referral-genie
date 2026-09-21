import type { AddressParts, RawHit, TaxonomyHit } from './types';

interface ApiAddress {
  address_purpose?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
}

interface ApiTaxonomy {
  code?: string;
  desc?: string | null;
  primary?: boolean;
}

export interface ApiResult {
  number?: string;
  enumeration_type?: string;
  basic?: {
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    organization_name?: string;
    status?: string;
    name?: string;
  };
  addresses?: ApiAddress[];
  practiceLocations?: ApiAddress[];
  taxonomies?: ApiTaxonomy[];
}

function blankAddress(raw: ApiAddress | undefined): AddressParts | null {
  if (!raw) return null;
  const parts: AddressParts = {
    address1: (raw.address_1 ?? '').trim(),
    address2: (raw.address_2 ?? '').trim(),
    city: (raw.city ?? '').trim(),
    state: (raw.state ?? '').trim(),
    postalCode: (raw.postal_code ?? '').trim(),
    phone: (raw.telephone_number ?? '').trim(),
  };
  const any = [parts.address1, parts.address2, parts.city, parts.state, parts.postalCode, parts.phone].some(
    (value) => value.length > 0,
  );
  return any ? parts : null;
}

function addressesWithPurpose(list: ApiAddress[] | undefined, purpose: string): AddressParts[] {
  return (list ?? [])
    .filter((row) => (row.address_purpose ?? '').toUpperCase() === purpose)
    .map((row) => blankAddress(row))
    .filter((row): row is AddressParts => row !== null);
}

export function hitFromApiResult(result: ApiResult): RawHit {
  const basic = result.basic ?? {};
  const enumerationType = (result.enumeration_type ?? '').trim();
  const organization = (basic.organization_name ?? '').trim();
  const person = [basic.first_name, basic.last_name].filter((part) => part && part.trim()).join(' ').trim();
  const name = organization || person || (basic.name ?? '').trim();

  const locationCandidates = [
    ...addressesWithPurpose(result.addresses, 'LOCATION'),
    ...addressesWithPurpose(result.practiceLocations, 'LOCATION'),
  ];
  const mailingCandidates = addressesWithPurpose(result.addresses, 'MAILING');

  const taxonomies: TaxonomyHit[] = (result.taxonomies ?? [])
    .filter((row) => (row.code ?? '').trim().length > 0)
    .map((row) => ({
      code: (row.code ?? '').trim(),
      desc: row.desc ?? null,
      primary: Boolean(row.primary),
    }));

  return {
    npi: (result.number ?? '').trim(),
    enumerationType,
    name,
    status: basic.status ?? null,
    taxonomies,
    locations: locationCandidates,
    mailing: mailingCandidates[0] ?? null,
  };
}
