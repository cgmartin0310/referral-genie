import type { Practice, Provider } from '@prisma/client';
import { estimateMonthlyReferrals, type ReferralEstimate } from './estimate';
import { resolveFaxTarget } from './fax';

export const SOURCE_TYPE_SHORT: Record<string, string> = {
  pediatrics: 'Pediatrics',
  pcp_family_medicine: 'Family medicine',
  pcp_general_practice: 'General practice',
  clinic_center: 'Clinic / health center',
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
  practiceId: string | null;
  practiceName: string | null;
  /** The number a fax to this provider actually goes to. */
  sendsTo: { number: string | null; level: 'provider' | 'practice'; fellBack: boolean };
}

export interface PracticeView {
  id: string;
  name: string;
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
  providerCount: number;
  taxonomyMix: Record<string, number>;
  estimate: ReferralEstimate | null;
  clinics: { id: string; name: string }[];
  providers: ProviderView[];
}

type PracticeWithRelations = Practice & {
  providers: Provider[];
  clinicPractices: { clinicLocation: { id: string; name: string } }[];
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
    practiceId: provider.practiceId,
    practiceName: practice?.name ?? null,
    sendsTo: { number: target.number, level: target.level, fellBack: target.fellBack },
  };
}

export function presentPractice(practice: PracticeWithRelations): PracticeView {
  const taxonomyMix = mixOf(practice.taxonomyMix);
  return {
    id: practice.id,
    name: practice.name,
    nameAmbiguous: practice.nameAmbiguous,
    address: practice.address,
    city: practice.city,
    state: practice.state,
    zipCode: practice.zipCode,
    countyName: practice.countyName,
    countyFips: practice.countyFips,
    phone: practice.phone,
    faxNumber: practice.faxNumber,
    orgNpis: practice.orgNpis,
    providerCount: practice.providerCount,
    taxonomyMix,
    estimate: estimateMonthlyReferrals(taxonomyMix),
    clinics: practice.clinicPractices.map((row) => row.clinicLocation),
    providers: practice.providers.map((provider) => presentProvider(provider, practice)),
  };
}

export const practiceInclude = {
  providers: { orderBy: { name: 'asc' as const } },
  clinicPractices: { select: { clinicLocation: { select: { id: true, name: true } } } },
};
