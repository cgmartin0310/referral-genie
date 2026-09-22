export type ProvenanceOrigin = 'nppes' | 'places' | 'user' | 'mixed' | 'research';

export interface Provenance {
  origin: ProvenanceOrigin;
  confidence: number | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
  overriddenFields: string[];
  /** Confidence for fields filled by research. Absent on older rows. */
  fieldConfidence?: Partial<Record<string, number>>;
}

/** CRM fields a person can correct. A later ingest will not overwrite these. */
export const OVERRIDABLE_FIELDS = [
  'name',
  'address',
  'city',
  'state',
  'zipCode',
  'contactPerson',
  'contactTitle',
  'contactPhone',
  'contactEmail',
  'faxNumber',
  'website',
  'notes',
  'rating',
  'expectedMonthlyReferrals',
  'numberOfProviders',
  'referralFormUrl',
  'preferredChannel',
  'categoryId',
  'placeId',
  'latitude',
  'longitude',
  'reviewCount',
  'businessStatus',
  'npiNumber',
] as const;

export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];

const ORIGINS = new Set<ProvenanceOrigin>(['nppes', 'places', 'user', 'mixed', 'research']);

function parseFieldConfidence(value: unknown): Partial<Record<string, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const confidence: Partial<Record<string, number>> = {};
  for (const [field, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) confidence[field] = raw;
  }
  return Object.keys(confidence).length > 0 ? confidence : undefined;
}

export function emptyProvenance(origin: ProvenanceOrigin): Provenance {
  return {
    origin,
    confidence: null,
    overriddenBy: null,
    overriddenAt: null,
    overriddenFields: [],
  };
}

export function parseProvenance(value: unknown): Provenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyProvenance('nppes');
  }
  const row = value as Partial<Provenance>;
  const origin = typeof row.origin === 'string' && ORIGINS.has(row.origin as ProvenanceOrigin)
    ? (row.origin as ProvenanceOrigin)
    : 'nppes';
  const overriddenFields = Array.isArray(row.overriddenFields)
    ? row.overriddenFields.filter((field): field is string => typeof field === 'string')
    : [];
  const fieldConfidence = parseFieldConfidence(row.fieldConfidence);
  return {
    origin,
    confidence: typeof row.confidence === 'number' && Number.isFinite(row.confidence) ? row.confidence : null,
    overriddenBy: typeof row.overriddenBy === 'string' ? row.overriddenBy : null,
    overriddenAt: typeof row.overriddenAt === 'string' ? row.overriddenAt : null,
    overriddenFields,
    ...(fieldConfidence ? { fieldConfidence } : {}),
  };
}

export function canonField(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

export function changedOverridableFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return OVERRIDABLE_FIELDS.filter((field) => {
    if (!(field in after)) return false;
    return canonField(before[field]) !== canonField(after[field]);
  });
}

export function userEditProvenance(existing: unknown, fields: string[], actor: string, nowIso: string): Provenance {
  const prior = existing == null ? emptyProvenance('user') : parseProvenance(existing);
  if (existing == null) {
    prior.origin = 'user';
  }
  const overriddenFields = [...new Set([...prior.overriddenFields, ...fields])];
  const origin: ProvenanceOrigin = prior.origin === 'user' ? 'user' : 'mixed';
  const fieldConfidence = { ...(prior.fieldConfidence ?? {}) };
  for (const field of fields) delete fieldConfidence[field];
  return {
    origin,
    confidence: prior.confidence,
    overriddenBy: actor,
    overriddenAt: nowIso,
    overriddenFields,
    ...(Object.keys(fieldConfidence).length > 0 ? { fieldConfidence } : {}),
  };
}

export function nextIngestProvenance(
  existing: unknown,
  confidence: number | null,
  origin: Exclude<ProvenanceOrigin, 'user' | 'mixed'>,
): Provenance {
  const prior = parseProvenance(existing);
  const hasOverride = prior.overriddenFields.length > 0;
  const keepMixed = hasOverride || prior.origin === 'research' || prior.origin === 'mixed' || prior.origin === 'user';
  return {
    origin: keepMixed ? 'mixed' : origin,
    confidence,
    overriddenBy: prior.overriddenBy,
    overriddenAt: prior.overriddenAt,
    overriddenFields: prior.overriddenFields,
    ...(prior.fieldConfidence ? { fieldConfidence: prior.fieldConfidence } : {}),
  };
}

export function researchProvenance(
  existing: unknown,
  accepted: { field: string; confidence: number }[],
): Provenance {
  const prior = parseProvenance(existing);
  const fieldConfidence = { ...(prior.fieldConfidence ?? {}) };
  for (const row of accepted) fieldConfidence[row.field] = row.confidence;
  const confidence = accepted.length > 0
    ? Math.min(...accepted.map((row) => row.confidence))
    : prior.confidence;
  const origin: ProvenanceOrigin = prior.origin === 'research' && prior.overriddenFields.length === 0
    ? 'research'
    : 'mixed';
  return {
    origin,
    confidence,
    overriddenBy: prior.overriddenBy,
    overriddenAt: prior.overriddenAt,
    overriddenFields: prior.overriddenFields,
    ...(Object.keys(fieldConfidence).length > 0 ? { fieldConfidence } : {}),
  };
}

export function stripOverriddenFields<T extends Record<string, unknown>>(
  incoming: T,
  overriddenFields: string[],
): Partial<T> {
  const blocked = new Set(overriddenFields);
  const next: Partial<T> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!blocked.has(key)) {
      next[key as keyof T] = value as T[keyof T];
    }
  }
  return next;
}
