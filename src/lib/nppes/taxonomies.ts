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
  | 'clinic_center'
  | 'ent'
  | 'neurology'
  | 'orthopedics'
  | 'sports_medicine'
  | 'pmr';

/**
 * Specialties the catalog can pull, per the Referral360 spec's discipline
 * map (ST: pediatrics, family medicine, ENT, neurology; OT: those plus hand
 * surgery; PT: those plus orthopedics, sports medicine, PM&R). Paragon turns
 * each on in Settings; the NPI file load keeps them all so turning one on
 * needs only a reload, not a code change.
 */
export const TAXONOMY_GROUPS: { group: TaxonomyGroup; label: string; organizations: boolean }[] = [
  { group: 'pediatrics', label: 'Pediatrics', organizations: false },
  { group: 'pcp_family_medicine', label: 'Family medicine', organizations: false },
  { group: 'pcp_general_practice', label: 'General practice', organizations: false },
  { group: 'ent', label: 'ENT (otolaryngology)', organizations: false },
  { group: 'neurology', label: 'Neurology', organizations: false },
  { group: 'orthopedics', label: 'Orthopedics and hand surgery', organizations: false },
  { group: 'sports_medicine', label: 'Sports medicine', organizations: false },
  { group: 'pmr', label: 'Physical medicine and rehabilitation', organizations: false },
  { group: 'clinic_center', label: 'Clinics and health centers (organizations)', organizations: true },
];

/** What the catalog pulls until Paragon changes it. */
export const DEFAULT_CATALOG_GROUPS: TaxonomyGroup[] = ['pediatrics', 'pcp_family_medicine', 'pcp_general_practice', 'clinic_center'];

export const TAXONOMY_CATALOG: TaxonomyCode[] = [
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
  // Specialists from the spec's discipline map. Off until Paragon turns them on.
  { code: '207Y00000X', description: 'Otolaryngology', group: 'ent' },
  { code: '207YP0228X', description: 'Otolaryngology, Pediatric Otolaryngology', group: 'ent' },
  { code: '2084N0400X', description: 'Psychiatry & Neurology, Neurology', group: 'neurology' },
  { code: '2084N0402X', description: 'Psychiatry & Neurology, Neurology with Special Qualifications in Child Neurology', group: 'neurology' },
  { code: '207X00000X', description: 'Orthopaedic Surgery', group: 'orthopedics' },
  { code: '207XS0106X', description: 'Orthopaedic Surgery, Hand Surgery', group: 'orthopedics' },
  { code: '207XP3100X', description: 'Orthopaedic Surgery, Pediatric Orthopaedic Surgery', group: 'orthopedics' },
  { code: '207XX0005X', description: 'Orthopaedic Surgery, Sports Medicine', group: 'sports_medicine' },
  { code: '207QS0010X', description: 'Family Medicine, Sports Medicine', group: 'sports_medicine' },
  { code: '2080S0010X', description: 'Pediatrics, Sports Medicine', group: 'sports_medicine' },
  { code: '208100000X', description: 'Physical Medicine & Rehabilitation', group: 'pmr' },
];

/** The codes the catalog pulls by default (the list before specialties could be turned on). */
export const TAXONOMY_ALLOW_LIST: TaxonomyCode[] = TAXONOMY_CATALOG.filter((row) => DEFAULT_CATALOG_GROUPS.includes(row.group));

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
  ent: 'ENT',
  neurology: 'Neurology',
  orthopedics: 'Orthopedics',
  sports_medicine: 'Sports Medicine',
  pmr: 'Physical Medicine & Rehabilitation',
};

/** Stable ReferralCategory ids seeded in the graph migration. Specialists have none. */
export const CATEGORY_ID_BY_SOURCE_TYPE: Partial<Record<TaxonomyGroup, string>> = {
  pediatrics: 'cat_pediatrician',
  pcp_family_medicine: 'cat_pcp_family_medicine',
  pcp_general_practice: 'cat_pcp_general_practice',
  clinic_center: 'cat_clinic_center',
};

const byCode = new Map(TAXONOMY_CATALOG.map((row) => [row.code, row]));

export function taxonomyByCode(code: string): TaxonomyCode | undefined {
  return byCode.get(code);
}

/** The codes of the specialties turned on (the defaults when none are given). */
export function allowListCodes(groups: readonly string[] = DEFAULT_CATALOG_GROUPS): Set<string> {
  const on = new Set(groups);
  return new Set(TAXONOMY_CATALOG.filter((row) => on.has(row.group)).map((row) => row.code));
}

/** Every code the catalog could pull. The NPI file load keeps all of them. */
export function catalogCodes(): Set<string> {
  return new Set(TAXONOMY_CATALOG.map((row) => row.code));
}

/** Only known specialty groups, in list order; the defaults when nothing usable is given. */
export function cleanCatalogGroups(value: unknown): TaxonomyGroup[] {
  const wanted = new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  const groups = TAXONOMY_GROUPS.map((row) => row.group).filter((group) => wanted.has(group));
  return groups.length > 0 ? groups : DEFAULT_CATALOG_GROUPS;
}

export function sourceTypeLabel(sourceType: string | null | undefined): string {
  if (!sourceType) return '';
  return SOURCE_TYPE_LABELS[sourceType as TaxonomyGroup] ?? sourceType;
}

/**
 * Therapy practices Paragon recruits as subscribers (the spec's CO Universe):
 * physical, occupational, and speech therapists, and the clinics they run.
 * Separate from the referral catalog; the NPI file load keeps them too.
 */
export const ACQUISITION_TAXONOMIES: { code: string; description: string; discipline: 'pt' | 'ot' | 'st' | 'clinic'; pediatric: boolean }[] = [
  { code: '225100000X', description: 'Physical Therapist', discipline: 'pt', pediatric: false },
  { code: '2251P0200X', description: 'Physical Therapist, Pediatrics', discipline: 'pt', pediatric: true },
  { code: '225X00000X', description: 'Occupational Therapist', discipline: 'ot', pediatric: false },
  { code: '225XP0200X', description: 'Occupational Therapist, Pediatrics', discipline: 'ot', pediatric: true },
  { code: '235Z00000X', description: 'Speech-Language Pathologist', discipline: 'st', pediatric: false },
  { code: '261QP2000X', description: 'Clinic/Center, Physical Therapy', discipline: 'clinic', pediatric: false },
  { code: '261QR0400X', description: 'Clinic/Center, Rehabilitation', discipline: 'clinic', pediatric: false },
  { code: '261QH0700X', description: 'Clinic/Center, Hearing and Speech', discipline: 'clinic', pediatric: false },
];

export function acquisitionCodes(): Set<string> {
  return new Set(ACQUISITION_TAXONOMIES.map((row) => row.code));
}
