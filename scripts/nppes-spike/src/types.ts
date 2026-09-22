export type SpikeSource = "fixture" | "api" | "file";

export interface AddressParts {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}

export interface TaxonomyHit {
  code: string;
  desc: string | null;
  primary: boolean;
}

/** One NPPES record, already shaped the same way from the API, a fixture, or the dissemination CSV. */
export interface RawHit {
  npi: string;
  enumerationType: string;
  name: string;
  status: string | null;
  deactivationDate: string | null;
  reactivationDate: string | null;
  taxonomies: TaxonomyHit[];
  /** Practice-location addresses. The first is the primary location from the source record. */
  locations: AddressParts[];
  mailing: AddressParts | null;
}

export interface QueryLog {
  search: string;
  zip: string;
  pages: number;
  rows: number;
  truncated: boolean;
  error: string | null;
}

export interface NormalizedProvider {
  npi: string;
  enumerationType: string;
  name: string;
  deactivated: boolean;
  primaryTaxonomyCode: string | null;
  primaryTaxonomyDesc: string | null;
  matchedTaxonomyCodes: string[];
  matchedGroup: string | null;
  matchedOnSecondaryOnly: boolean;
  city: string;
  state: string;
  zip5: string;
  address1: string;
  hasPhone: boolean;
  flags: string[];
  rawHitCount: number;
}

export interface AddressQuality {
  missingAddress: number;
  missingPracticeLocation: number;
  missingStreet: number;
  missingPhone: number;
  missingCity: number;
  invalidState: number;
  invalidZip: number;
  unparseableCityStateOrZip: number;
  poBox: number;
  zipOutsideCounty: number;
  boundaryZip: number;
  deactivated: number;
  matchedOnSecondaryOnly: number;
  placesMatchReady: number;
}

export interface SpikeReport {
  generatedAt: string;
  source: SpikeSource;
  sourceDetail: string;
  county: {
    id: string;
    name: string;
    state: string;
    fips: string;
  };
  taxonomyAllowListCount: number;
  queries: QueryLog[];
  rawHitCount: number;
  uniqueNpiBeforeTaxonomyFilter: number;
  duplicateNpiCount: number;
  extraDuplicateHits: number;
  droppedNotInAllowList: number;
  /** Had an allow-listed code, but not as the primary taxonomy. Excluded from kept counts. */
  excludedSecondaryOnly: number;
  keptCount: number;
  byEnumeration: Record<string, number>;
  byPrimaryTaxonomy: { code: string; description: string; count: number }[];
  byGroup: Record<string, number>;
  addressQuality: AddressQuality;
  addressQualityPercent: Record<keyof AddressQuality, number>;
  truncatedQueryCount: number;
  notes: string[];
}
