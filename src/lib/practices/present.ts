import { parseTier, type Tier } from '../referral-list/tiers';
import type { Practice, Provider } from '@prisma/client';
import { estimateMonthlyReferrals, DEFAULT_ESTIMATE_RATES, type EstimateRates, type ReferralEstimate } from './estimate';
import { resolveFaxTarget } from './fax';
import { nearestClinic, type Located } from '../geo/distance';

export const SOURCE_TYPE_SHORT: Record<string, string> = {
  pediatrics: 'Pediatrics',
  pcp_family_medicine: 'Family medicine',
  pcp_general_practice: 'General practice',
  clinic_center: 'Clinic / health center',
  ent: 'ENT',
  neurology: 'Neurology',
  orthopedics: 'Orthopedics',
  sports_medicine: 'Sports medicine',
  pmr: 'PM&R',
  // Types no longer pulled; rows formed under an older list can still carry them.
  pcp_internal_medicine: 'Internal medicine',
  pediatrics_np: 'Pediatric NP',
  pcp_np_pa: 'NP / PA',
};

export interface ProviderView {
  id: string;
  npiNumber: string;
  name: string;
  primaryTaxonomyCode: string | null;
  sourceType: string | null;
  sourceTypeLabel: string;
  faxNumber: string | null;
  useOwnFax: boolean;
  /** Removed from the list by a person. */
  hidden: boolean;
  practiceId: string | null;
  practiceName: string | null;
  /** The number a fax to this provider actually goes to. */
  sendsTo: { number: string | null; level: 'provider' | 'practice'; fellBack: boolean };
}

/**
 * What names the row: an organization NPI, the Google Places listing its
 * providers share, or the single provider listed on their own.
 */
export type PracticeKind = 'organization' | 'listing' | 'provider';

export interface PracticeView {
  id: string;
  name: string;
  kind: PracticeKind;
  /** Business name on the Google Places listing, when matched. */
  placeName: string | null;
  nameAmbiguous: boolean;
  /** Fields a person changed; the pull leaves them alone. */
  editedFields: string[];
  /** Deleted by a person. */
  hidden: boolean;
  /** Asked to stop receiving faxes; no campaign faxes it. */
  faxOptOut: { at: string; by: string | null } | null;
  /** The viewer's nearest clinic and how far, when both have a place. */
  nearest: { clinicId: string; clinicName: string; miles: number } | null;
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
  providerCount: number;
  taxonomyMix: Record<string, number>;
  estimate: ReferralEstimate | null;
  clinics: { id: string; name: string }[];
  /** The viewer's score for it: trusted, warm, cold, not_fit, or none yet. */
  score: Tier | null;
  /** Added by hand by the viewer's organization, not pulled into the catalog. */
  ownPractice: boolean;
  providers: ProviderView[];
}

type PracticeWithRelations = Practice & {
  providers: Provider[];
  clinicPractices: { clinicLocation: { id: string; name: string } }[];
  /** The viewer's score, when included (practiceIncludeFor). */
  scores?: { tier: string }[];
};

function mixOf(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === 'number' && Number.isFinite(count)) out[key] = count;
  }
  return out;
}

export function presentProvider(
  provider: Provider,
  practice: Pick<Practice, 'id' | 'name' | 'faxNumber'> | null,
): ProviderView {
  const target = resolveFaxTarget(
    { id: provider.id, name: provider.name, faxNumber: provider.faxNumber, useOwnFax: provider.useOwnFax },
    { id: practice?.id ?? '', name: practice?.name ?? '', faxNumber: practice?.faxNumber ?? null },
  );
  return {
    id: provider.id,
    npiNumber: provider.npiNumber,
    name: provider.name,
    primaryTaxonomyCode: provider.primaryTaxonomyCode,
    sourceType: provider.sourceType,
    sourceTypeLabel: (provider.sourceType && SOURCE_TYPE_SHORT[provider.sourceType]) || provider.sourceType || 'Unknown',
    faxNumber: provider.faxNumber,
    useOwnFax: provider.useOwnFax,
    hidden: provider.hiddenAt !== null,
    practiceId: provider.practiceId,
    practiceName: practice?.name ?? null,
    sendsTo: { number: target.number, level: target.level, fellBack: target.fellBack },
  };
}

export function practiceKind(practice: Pick<Practice, 'orgNpis' | 'practiceKey' | 'formedBy'>): PracticeKind {
  if (practice.formedBy === 'organization' || practice.formedBy === 'listing' || practice.formedBy === 'provider') {
    return practice.formedBy;
  }
  if (practice.orgNpis.length > 0) return 'organization';
  return practice.practiceKey.startsWith('npi:') ? 'provider' : 'listing';
}

export function presentPractice(
  practice: PracticeWithRelations,
  rates: EstimateRates = DEFAULT_ESTIMATE_RATES,
  clinics: Located[] = [],
): PracticeView {
  const taxonomyMix = mixOf(practice.taxonomyMix);
  return {
    id: practice.id,
    name: practice.name,
    kind: practiceKind(practice),
    placeName: practice.placeName,
    nameAmbiguous: practice.nameAmbiguous,
    editedFields: practice.editedFields,
    hidden: practice.hiddenAt !== null,
    faxOptOut: practice.faxOptOutAt ? { at: practice.faxOptOutAt.toISOString(), by: practice.faxOptOutBy } : null,
    nearest: nearestClinic(practice, clinics),
    address: practice.address,
    city: practice.city,
    state: practice.state,
    zipCode: practice.zipCode,
    countyName: practice.countyName,
    countyFips: practice.countyFips,
    phone: practice.phone,
    faxNumber: practice.faxNumber,
    website: practice.website,
    rating: practice.rating,
    reviewCount: practice.reviewCount,
    orgNpis: practice.orgNpis,
    providerCount: practice.providerCount,
    taxonomyMix,
    estimate: estimateMonthlyReferrals(taxonomyMix, rates),
    clinics: practice.clinicPractices.map((row) => row.clinicLocation),
    score: parseTier(practice.scores?.[0]?.tier),
    // Added by hand (own:…): only that organization sees it.
    ownPractice: practice.practiceKey.startsWith('own:'),
    providers: practice.providers.map((provider) => presentProvider(provider, practice)),
  };
}

/** A practice with its providers and the viewer's own clinics listing it (never another subscriber's). */
export function practiceIncludeFor(organizationId: string) {
  return {
    providers: { where: { hiddenAt: null }, orderBy: { name: 'asc' as const } },
    clinicPractices: {
      where: { organizationId, excludedAt: null },
      select: { clinicLocation: { select: { id: true, name: true } } },
    },
    scores: { where: { organizationId }, select: { tier: true } },
  };
}
