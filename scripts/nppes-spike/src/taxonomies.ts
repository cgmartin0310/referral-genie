/**
 * ICP for this spike: outpatient OT/PT/ST referral sources are pediatricians
 * and primary care physicians only.
 *
 * Kept codes are general pediatrics, the pediatric primary-care variants
 * already in this list (adolescent medicine, developmental-behavioral
 * pediatrics), and family medicine, internal medicine, and general practice
 * — including adult and geriatric primary care. Sports medicine, orthopaedics,
 * neurology, PM&R, rheumatology, physician assistants, nurse practitioners,
 * schools, and early-intervention agencies are not on the list.
 *
 * The NPPES API matches taxonomy_description loosely (a search for
 * "General Practice" also returns dentists; "Internal Medicine" returns
 * subspecialists). The allow-list below is the filter that decides who is
 * counted. Search strings are only how we ask the API for candidates.
 */

export interface TaxonomyCode {
  code: string;
  description: string;
  group: TaxonomyGroup;
}

export type TaxonomyGroup =
  | "pcp_family_medicine"
  | "pcp_internal_medicine"
  | "pcp_general_practice"
  | "pediatrics";

export const TAXONOMY_ALLOW_LIST: TaxonomyCode[] = [
  { code: "207Q00000X", description: "Family Medicine", group: "pcp_family_medicine" },
  { code: "207QA0505X", description: "Family Medicine, Adult Medicine", group: "pcp_family_medicine" },
  { code: "207QG0300X", description: "Family Medicine, Geriatric Medicine", group: "pcp_family_medicine" },

  { code: "207R00000X", description: "Internal Medicine", group: "pcp_internal_medicine" },
  { code: "207RG0300X", description: "Internal Medicine, Geriatric Medicine", group: "pcp_internal_medicine" },

  { code: "208D00000X", description: "General Practice", group: "pcp_general_practice" },

  { code: "208000000X", description: "Pediatrics", group: "pediatrics" },
  { code: "2080A0000X", description: "Pediatrics, Adolescent Medicine", group: "pediatrics" },
  { code: "2080P0006X", description: "Pediatrics, Developmental - Behavioral Pediatrics", group: "pediatrics" },
];

/**
 * Strings passed to the NPPES Read API `taxonomy_description` parameter.
 * The API does not filter by taxonomy code. Each string is a loose match;
 * results are then filtered to TAXONOMY_ALLOW_LIST, and only a primary
 * taxonomy on that list is kept.
 */
export const TAXONOMY_SEARCHES: { search: string; why: string }[] = [
  { search: "Family Medicine", why: "Family medicine PCPs, including adult and geriatric medicine" },
  { search: "Internal Medicine", why: "General and geriatric internal medicine; subspecialists are dropped" },
  { search: "General Practice", why: "Physician general practice. Dentist hits are dropped" },
  { search: "Pediatrics", why: "Pediatricians, including adolescent and developmental-behavioral pediatrics" },
];

const byCode = new Map(TAXONOMY_ALLOW_LIST.map((row) => [row.code, row]));

export function taxonomyByCode(code: string): TaxonomyCode | undefined {
  return byCode.get(code);
}

export function allowListCodes(): Set<string> {
  return new Set(TAXONOMY_ALLOW_LIST.map((row) => row.code));
}
