import { CATEGORY_ID_BY_SOURCE_TYPE, type TaxonomyGroup } from '../nppes/taxonomies';
import type { CountyMarket } from '../nppes/counties';
import type { KeptProvider } from '../nppes/types';
import { normalizeNpiNumber } from '../npi';
import { nextIngestProvenance, parseProvenance, stripOverriddenFields, type Provenance } from '../provenance';
import type { PlaceMatch } from '../places/match';

export interface SourceWrite {
  name?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  contactPhone?: string | null;
  faxNumber?: string | null;
  website?: string | null;
  rating?: number | null;
  npiNumber?: string | null;
  taxonomyCodes?: string[];
  primaryTaxonomyCode?: string | null;
  enumerationType?: string | null;
  countyName?: string | null;
  countyFips?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reviewCount?: number | null;
  businessStatus?: string | null;
  sourceType?: string | null;
  placesMatchStatus?: string | null;
  addressFlags?: string[];
  categoryId?: string | null;
  provenance?: Provenance;
  organizationId?: string;
}

function categoryIdFor(sourceType: string): string | null {
  if (sourceType in CATEGORY_ID_BY_SOURCE_TYPE) {
    return CATEGORY_ID_BY_SOURCE_TYPE[sourceType as TaxonomyGroup];
  }
  return null;
}

export function buildNppesUpsert(
  kept: KeptProvider,
  county: CountyMarket,
  organizationId: string,
  existingProvenance: unknown,
): { create: SourceWrite; update: SourceWrite } {
  const provenance = nextIngestProvenance(existingProvenance, null, 'nppes');
  const create: SourceWrite = {
    organizationId,
    npiNumber: normalizeNpiNumber(kept.npi),
    name: kept.name,
    address: kept.address || null,
    city: kept.city || null,
    state: kept.state || null,
    zipCode: kept.zipCode || null,
    contactPhone: kept.phone || null,
    taxonomyCodes: kept.taxonomyCodes,
    primaryTaxonomyCode: kept.primaryTaxonomyCode,
    enumerationType: kept.enumerationType,
    countyName: county.name,
    countyFips: county.fips,
    sourceType: kept.sourceType,
    categoryId: categoryIdFor(kept.sourceType),
    addressFlags: kept.addressFlags,
    placesMatchStatus: kept.quarantined ? 'quarantined' : 'pending',
    provenance,
  };

  // NPPES publishes a fax on roughly half of practice locations. Only write it
  // when it is actually there: an absent value must not wipe a fax that research
  // or a person already found.
  if (kept.fax) create.faxNumber = kept.fax;

  const rest: Record<string, unknown> = { ...create };
  delete rest.organizationId;
  delete rest.npiNumber;
  const update = {
    ...stripOverriddenFields(rest, provenance.overriddenFields),
    taxonomyCodes: kept.taxonomyCodes,
    primaryTaxonomyCode: kept.primaryTaxonomyCode,
    enumerationType: kept.enumerationType,
    countyName: county.name,
    countyFips: county.fips,
    sourceType: kept.sourceType,
    addressFlags: kept.addressFlags,
    placesMatchStatus: kept.quarantined ? 'quarantined' : 'pending',
    provenance,
  };

  return { create, update };
}

export function buildPlacesWrite(match: PlaceMatch | null, existingProvenance: unknown): SourceWrite {
  if (!match) {
    const provenance = nextIngestProvenance(existingProvenance, null, 'nppes');
    const cleared: SourceWrite = {
      placeId: null,
      latitude: null,
      longitude: null,
      reviewCount: null,
      businessStatus: null,
      rating: null,
      placesMatchStatus: 'unmatched',
      provenance,
    };
    return {
      ...stripOverriddenFields(cleared as Record<string, unknown>, provenance.overriddenFields),
      placesMatchStatus: 'unmatched',
      provenance,
    };
  }

  const provenance = nextIngestProvenance(existingProvenance, match.confidence, 'places');
  const incoming: SourceWrite = {
    placeId: match.placeId,
    latitude: match.latitude,
    longitude: match.longitude,
    reviewCount: match.reviewCount,
    businessStatus: match.businessStatus,
    placesMatchStatus: 'matched',
    provenance,
  };
  if (match.phone) incoming.contactPhone = match.phone;
  if (match.website) incoming.website = match.website;
  if (match.rating != null) incoming.rating = match.rating;

  return {
    ...stripOverriddenFields(incoming as Record<string, unknown>, parseProvenance(existingProvenance).overriddenFields),
    placesMatchStatus: 'matched',
    provenance,
  };
}
