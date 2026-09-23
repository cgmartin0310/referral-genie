/**
 * discover: search Google for the county's practices. details: phone, website,
 * rating for each. nppes: the NPI records. group: retire, attach, form.
 * lookup: a Places search for each NPI record no listing claimed. practices:
 * the final formation. ("places" and "duplicates" are older names for lookup.)
 */
export type IngestPhase = 'discover' | 'details' | 'nppes' | 'group' | 'lookup' | 'places' | 'duplicates' | 'practices' | 'done';

export interface IngestCursor {
  phase: IngestPhase;
  /** Which town-and-query search the discovery is on. */
  discoverIndex: number;
  /** The next page of the current search, when Google has more. */
  pageToken: string | null;
  pageCount: number;
  zipIndex: number;
  searchIndex: number;
  skip: number;
  /** Where the NPI stage reads from: the loaded NPI file, or the NPPES API ZIP by ZIP. */
  source: 'file' | 'api';
}

export interface IngestSummary {
  /** Listings kept by the county search, and how many of them are in a clinician's own name. */
  placesFound: number;
  placesPersonal: number;
  discoverQueries: number;
  discoverQueryTotal: number;
  /** Listings found from an NPI record's own phone or address, after the county search. */
  placesFromLookup: number;
  /** NPI records nested under a listing, and those Google lists nowhere. */
  providersAttached: number;
  providersUnattached: number;
  npisUpserted: number;
  npisCreated: number;
  npisUpdated: number;
  placesMatched: number;
  placesUnmatched: number;
  quarantined: number;
  duplicatesFlagged: number;
  duplicateClusters: number;
  practicesFormed: number;
  providersLinked: number;
  /** Sources from earlier pulls that this pull did not see and removed. */
  retired: number;
  droppedNotAllowList: number;
  excludedSecondaryOnly: number;
  nppesQueries: number;
  nppesQueryTotal: number;
  truncatedQueries: number;
  nppesErrors: string[];
  seenNpis: string[];
}

export function emptyCursor(): IngestCursor {
  return { phase: 'discover', discoverIndex: 0, pageToken: null, pageCount: 0, zipIndex: 0, searchIndex: 0, skip: 0, source: 'api' };
}

export function emptySummary(nppesQueryTotal: number): IngestSummary {
  return {
    placesFound: 0,
    placesPersonal: 0,
    discoverQueries: 0,
    discoverQueryTotal: 0,
    placesFromLookup: 0,
    providersAttached: 0,
    providersUnattached: 0,
    npisUpserted: 0,
    npisCreated: 0,
    npisUpdated: 0,
    placesMatched: 0,
    placesUnmatched: 0,
    quarantined: 0,
    duplicatesFlagged: 0,
    duplicateClusters: 0,
    practicesFormed: 0,
    providersLinked: 0,
    retired: 0,
    droppedNotAllowList: 0,
    excludedSecondaryOnly: 0,
    nppesQueries: 0,
    nppesQueryTotal,
    truncatedQueries: 0,
    nppesErrors: [],
    seenNpis: [],
  };
}

function numberField(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parseCursor(value: unknown): IngestCursor {
  const row = value && typeof value === 'object' ? (value as Partial<IngestCursor>) : {};
  const phase = row.phase;
  const allowed: IngestPhase[] = ['discover', 'details', 'nppes', 'group', 'lookup', 'places', 'duplicates', 'practices', 'done'];
  return {
    phase: allowed.includes(phase as IngestPhase) ? (phase as IngestPhase) : 'discover',
    discoverIndex: numberField(row.discoverIndex),
    pageToken: typeof row.pageToken === 'string' && row.pageToken ? row.pageToken : null,
    pageCount: numberField(row.pageCount),
    zipIndex: numberField(row.zipIndex),
    searchIndex: numberField(row.searchIndex),
    skip: numberField(row.skip),
    source: row.source === 'file' ? 'file' : 'api',
  };
}

export function parseSummary(value: unknown): IngestSummary {
  const row = value && typeof value === 'object' ? (value as Partial<IngestSummary>) : {};
  const base = emptySummary(numberField(row.nppesQueryTotal));
  return {
    ...base,
    placesFound: numberField(row.placesFound),
    placesPersonal: numberField(row.placesPersonal),
    discoverQueries: numberField(row.discoverQueries),
    discoverQueryTotal: numberField(row.discoverQueryTotal),
    placesFromLookup: numberField(row.placesFromLookup),
    providersAttached: numberField(row.providersAttached),
    providersUnattached: numberField(row.providersUnattached),
    npisUpserted: numberField(row.npisUpserted),
    npisCreated: numberField(row.npisCreated),
    npisUpdated: numberField(row.npisUpdated),
    placesMatched: numberField(row.placesMatched),
    placesUnmatched: numberField(row.placesUnmatched),
    quarantined: numberField(row.quarantined),
    duplicatesFlagged: numberField(row.duplicatesFlagged),
    duplicateClusters: numberField(row.duplicateClusters),
    practicesFormed: numberField(row.practicesFormed),
    providersLinked: numberField(row.providersLinked),
    retired: numberField(row.retired),
    droppedNotAllowList: numberField(row.droppedNotAllowList),
    excludedSecondaryOnly: numberField(row.excludedSecondaryOnly),
    nppesQueries: numberField(row.nppesQueries),
    nppesQueryTotal: numberField(row.nppesQueryTotal),
    truncatedQueries: numberField(row.truncatedQueries),
    nppesErrors: Array.isArray(row.nppesErrors)
      ? row.nppesErrors.filter((item): item is string => typeof item === 'string').slice(0, 20)
      : [],
    seenNpis: Array.isArray(row.seenNpis)
      ? row.seenNpis.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export type PublicSummary = Omit<IngestSummary, 'seenNpis'>;

export function publicSummary(summary: IngestSummary): PublicSummary {
  const { seenNpis: _seen, ...rest } = summary;
  return rest;
}
