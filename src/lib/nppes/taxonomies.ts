/**
 * ICP: outpatient OT/PT/ST referral sources are pediatricians and primary
 * care physicians only. Same nine NUCC codes as the NPPES spike.
 *
 * The NPPES API matches taxonomy_description loosely. Search strings only
 * ask for candidates. A row is kept only when its primary taxonomy is here.
 */

export interface TaxonomyCode {
  code: string;
  description: string;
  group: TaxonomyGroup;
}

export type TaxonomyGroup =
  | 'pcp_family_medicine'
  | 'pcp_internal_medicine'
  | 'pcp_general_practice'
  | 'pediatrics';

export const TAXONOMY_ALLOW_LIST: TaxonomyCode[] = [
  { code: '207Q00000X', description: 'Family Medicine', group: 'pcp_family_medicine' },
  { code: '207QA0505X', description: 'Family Medicine, Adult Medicine', group: 'pcp_family_medicine' },
  { code: '207QG0300X', description: 'Family Medicine, Geriatric Medicine', group: 'pcp_family_medicine' },
  { code: '207R00000X', description: 'Internal Medicine', group: 'pcp_internal_medicine' },
  { code: '207RG0300X', description: 'Internal Medicine, Geriatric Medicine', group: 'pcp_internal_medicine' },
  { code: '208D00000X', description: 'General Practice', group: 'pcp_general_practice' },
  { code: '208000000X', description: 'Pediatrics', group: 'pediatrics' },
  { code: '2080A0000X', description: 'Pediatrics, Adolescent Medicine', group: 'pediatrics' },
  { code: '2080P0006X', description: 'Pediatrics, Developmental - Behavioral Pediatrics', group: 'pediatrics' },
];

export const TAXONOMY_SEARCHES: { search: string; why: string }[] = [
  { search: 'Family Medicine', why: 'Family medicine PCPs, including adult and geriatric medicine' },
  { search: 'Internal Medicine', why: 'General and geriatric internal medicine; subspecialists are dropped' },
  { search: 'General Practice', why: 'Physician general practice. Dentist hits are dropped' },
  { search: 'Pediatrics', why: 'Pediatricians, including adolescent and developmental-behavioral pediatrics' },
];

export const SOURCE_TYPE_LABELS: Record<TaxonomyGroup, string> = {
  pediatrics: 'Pediatrician',
  pcp_family_medicine: 'PCP - Family Medicine',
  pcp_internal_medicine: 'PCP - Internal Medicine',
  pcp_general_practice: 'PCP - General Practice',
};

/** Stable ReferralCategory ids seeded in the graph migration. */
export const CATEGORY_ID_BY_SOURCE_TYPE: Record<TaxonomyGroup, string> = {
  pediatrics: 'cat_pediatrician',
  pcp_family_medicine: 'cat_pcp_family_medicine',
  pcp_internal_medicine: 'cat_pcp_internal_medicine',
  pcp_general_practice: 'cat_pcp_general_practice',
};

const byCode = new Map(TAXONOMY_ALLOW_LIST.map((row) => [row.code, row]));

export function taxonomyByCode(code: string): TaxonomyCode | undefined {
  return byCode.get(code);
}

export function allowListCodes(): Set<string> {
  return new Set(TAXONOMY_ALLOW_LIST.map((row) => row.code));
}

export function sourceTypeLabel(sourceType: string | null | undefined): string {
  if (!sourceType) return '';
  return SOURCE_TYPE_LABELS[sourceType as TaxonomyGroup] ?? sourceType;
}
