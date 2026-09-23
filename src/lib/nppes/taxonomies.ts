/**
 * ICP: outpatient OT/PT/ST referral sources are pediatricians and primary
 * care physicians (family medicine and general practice) to start. Internal
 * medicine, nurse practitioners, and physician assistants are excluded for
 * now: internists rarely refer to pediatric therapy, and the NP and PA codes
 * do not reliably say whether the person is in primary care. Plus the
 * clinic/center organizations (NPI-2) that run
 * primary care: primary care clinics, rural health clinics, FQHCs, health
 * departments, multi-specialty groups. Those org records carry the practice
 * name and fax, so without them a practice shows up named by its street.
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
  | 'pcp_general_practice'
  | 'pediatrics'
  | 'clinic_center';

export const TAXONOMY_ALLOW_LIST: TaxonomyCode[] = [
  // Family medicine's adult-medicine (207QA0505X) and geriatric (207QG0300X)
  // subtypes are left out: they see adults only, and in practice work as
  // internists (often in hospitals).
  { code: '207Q00000X', description: 'Family Medicine', group: 'pcp_family_medicine' },
  { code: '208D00000X', description: 'General Practice', group: 'pcp_general_practice' },
  { code: '208000000X', description: 'Pediatrics', group: 'pediatrics' },
  { code: '2080A0000X', description: 'Pediatrics, Adolescent Medicine', group: 'pediatrics' },
  { code: '2080P0006X', description: 'Pediatrics, Developmental - Behavioral Pediatrics', group: 'pediatrics' },
  // Organizations (NPI-2). No providers are counted from these; they name the practice.
  { code: '261QP2300X', description: 'Clinic/Center, Primary Care', group: 'clinic_center' },
  { code: '261QR1300X', description: 'Clinic/Center, Rural Health', group: 'clinic_center' },
  { code: '261QF0400X', description: 'Clinic/Center, Federally Qualified Health Center (FQHC)', group: 'clinic_center' },
  { code: '261QP0905X', description: 'Clinic/Center, Public Health, State or Local', group: 'clinic_center' },
  { code: '261QP0904X', description: 'Clinic/Center, Public Health, Federal', group: 'clinic_center' },
  { code: '261QM1300X', description: 'Clinic/Center, Multi-Specialty', group: 'clinic_center' },
];

export const TAXONOMY_SEARCHES: { search: string; why: string }[] = [
  { search: 'Family Medicine', why: 'Family medicine PCPs (adult and geriatric subtypes are dropped by code)' },
  { search: 'General Practice', why: 'Physician general practice. Dentist hits are dropped' },
  { search: 'Pediatrics', why: 'Pediatricians, including adolescent and developmental-behavioral pediatrics' },
  { search: 'Primary Care', why: 'Clinic/Center, Primary Care organizations' },
  { search: 'Rural Health', why: 'Rural health clinics' },
  { search: 'Federally Qualified Health Center', why: 'FQHCs' },
  { search: 'Public Health', why: 'County and state health departments' },
  { search: 'Multi-Specialty', why: 'Multi-specialty groups that include primary care' },
];

export const SOURCE_TYPE_LABELS: Record<TaxonomyGroup, string> = {
  pediatrics: 'Pediatrician',
  pcp_family_medicine: 'PCP - Family Medicine',
  pcp_general_practice: 'PCP - General Practice',
  clinic_center: 'Clinic / Health Center',
};

/** Stable ReferralCategory ids seeded in the graph migration. */
export const CATEGORY_ID_BY_SOURCE_TYPE: Record<TaxonomyGroup, string> = {
  pediatrics: 'cat_pediatrician',
  pcp_family_medicine: 'cat_pcp_family_medicine',
  pcp_general_practice: 'cat_pcp_general_practice',
  clinic_center: 'cat_clinic_center',
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
