/**
 * Therapy-relevant NUCC codes for an outpatient therapy referral graph.
 *
 * These are referring clinicians and a few org types that send patients to
 * PT/OT/ST. They are not the therapy practice itself (PT/OT/SLP codes are
 * omitted on purpose).
 *
 * The NPPES API matches taxonomy_description loosely (a search for
 * "General Practice" also returns dentists). The allow-list below is the
 * filter that decides who is counted. Search strings are only how we ask
 * the API for candidates.
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
  | "pediatrics"
  | "orthopaedics"
  | "neurology"
  | "pmr"
  | "rheumatology"
  | "physician_assistant"
  | "nurse_practitioner"
  | "early_intervention"
  | "school";

export const TAXONOMY_ALLOW_LIST: TaxonomyCode[] = [
  { code: "207Q00000X", description: "Family Medicine", group: "pcp_family_medicine" },
  { code: "207QA0505X", description: "Family Medicine, Adult Medicine", group: "pcp_family_medicine" },
  { code: "207QG0300X", description: "Family Medicine, Geriatric Medicine", group: "pcp_family_medicine" },
  { code: "207QS0010X", description: "Family Medicine, Sports Medicine", group: "pcp_family_medicine" },

  { code: "207R00000X", description: "Internal Medicine", group: "pcp_internal_medicine" },
  { code: "207RG0300X", description: "Internal Medicine, Geriatric Medicine", group: "pcp_internal_medicine" },
  { code: "207RS0010X", description: "Internal Medicine, Sports Medicine", group: "pcp_internal_medicine" },

  { code: "208D00000X", description: "General Practice", group: "pcp_general_practice" },

  { code: "208000000X", description: "Pediatrics", group: "pediatrics" },
  { code: "2080A0000X", description: "Pediatrics, Adolescent Medicine", group: "pediatrics" },
  { code: "2080P0006X", description: "Pediatrics, Developmental - Behavioral Pediatrics", group: "pediatrics" },

  { code: "207X00000X", description: "Orthopaedic Surgery", group: "orthopaedics" },
  { code: "207XP3100X", description: "Orthopaedic Surgery, Pediatric Orthopaedic Surgery", group: "orthopaedics" },
  { code: "207XS0117X", description: "Orthopaedic Surgery, Orthopaedic Surgery of the Spine", group: "orthopaedics" },
  { code: "207XX0005X", description: "Orthopaedic Surgery, Sports Medicine", group: "orthopaedics" },
  { code: "207XX0801X", description: "Orthopaedic Surgery, Orthopaedic Trauma", group: "orthopaedics" },

  { code: "2084N0400X", description: "Psychiatry & Neurology, Neurology", group: "neurology" },
  {
    code: "2084N0402X",
    description: "Psychiatry & Neurology, Neurology with Special Qualifications in Child Neurology",
    group: "neurology",
  },
  { code: "2084P0005X", description: "Psychiatry & Neurology, Neurodevelopmental Disabilities", group: "neurology" },

  { code: "208100000X", description: "Physical Medicine & Rehabilitation", group: "pmr" },
  {
    code: "2081P0010X",
    description: "Physical Medicine & Rehabilitation, Pediatric Rehabilitation Medicine",
    group: "pmr",
  },
  { code: "2081P2900X", description: "Physical Medicine & Rehabilitation, Pain Medicine", group: "pmr" },
  { code: "2081S0010X", description: "Physical Medicine & Rehabilitation, Sports Medicine", group: "pmr" },

  { code: "207RR0500X", description: "Internal Medicine, Rheumatology", group: "rheumatology" },

  { code: "363A00000X", description: "Physician Assistant", group: "physician_assistant" },
  { code: "363AM0700X", description: "Physician Assistant, Medical", group: "physician_assistant" },
  { code: "363AS0400X", description: "Physician Assistant, Surgical", group: "physician_assistant" },

  { code: "363L00000X", description: "Nurse Practitioner", group: "nurse_practitioner" },
  { code: "363LA2200X", description: "Nurse Practitioner, Adult Health", group: "nurse_practitioner" },
  { code: "363LF0000X", description: "Nurse Practitioner, Family", group: "nurse_practitioner" },
  { code: "363LG0600X", description: "Nurse Practitioner, Gerontology", group: "nurse_practitioner" },
  { code: "363LP0200X", description: "Nurse Practitioner, Pediatrics", group: "nurse_practitioner" },
  { code: "363LP2300X", description: "Nurse Practitioner, Primary Care", group: "nurse_practitioner" },

  { code: "252Y00000X", description: "Early Intervention Provider Agency", group: "early_intervention" },
  { code: "251300000X", description: "Local Education Agency (LEA)", group: "school" },
];

/**
 * Strings passed to the NPPES Read API `taxonomy_description` parameter.
 * The API does not filter by taxonomy code. Each string is a loose match;
 * results are then filtered to TAXONOMY_ALLOW_LIST.
 */
export const TAXONOMY_SEARCHES: { search: string; why: string }[] = [
  { search: "Family Medicine", why: "PCP family medicine and its specializations" },
  { search: "Internal Medicine", why: "PCP internal medicine, geriatric, sports; also pulls subspecialties we drop" },
  { search: "General Practice", why: "Physician general practice. Also matches dentists; those codes are dropped" },
  { search: "Pediatrics", why: "Pediatricians. Also matches some pediatric NPs; NP codes are allow-listed separately" },
  { search: "Orthopaedic Surgery", why: "Orthopaedics, including pediatric, spine, sports, and trauma" },
  { search: "Neurology", why: "Neurology and child neurology" },
  { search: "Physical Medicine & Rehabilitation", why: "PM&R, pediatric rehab, pain, sports" },
  { search: "Rheumatology", why: "Rheumatology, a high-affinity therapy referrer" },
  { search: "Physician Assistant", why: "PAs" },
  { search: "Nurse Practitioner", why: "NPs, including family, adult, gerontology, pediatrics, primary care" },
  { search: "Early Intervention", why: "Early intervention agencies (code 252Y00000X kept; other hits dropped)" },
  { search: "Local Education Agency", why: "School district / LEA NPIs" },
];

const byCode = new Map(TAXONOMY_ALLOW_LIST.map((row) => [row.code, row]));

export function taxonomyByCode(code: string): TaxonomyCode | undefined {
  return byCode.get(code);
}

export function allowListCodes(): Set<string> {
  return new Set(TAXONOMY_ALLOW_LIST.map((row) => row.code));
}
