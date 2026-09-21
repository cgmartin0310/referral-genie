export type IngestPhase = 'nppes' | 'places' | 'duplicates' | 'done';

export interface IngestCursor {
  phase: IngestPhase;
  zipIndex: number;
  searchIndex: number;
  skip: number;
}

export interface IngestSummary {
  npisUpserted: number;
  npisCreated: number;
  npisUpdated: number;
  placesMatched: number;
  placesUnmatched: number;
  quarantined: number;
  duplicatesFlagged: number;
  duplicateClusters: number;
  droppedNotAllowList: number;
  excludedSecondaryOnly: number;
  nppesQueries: number;
  nppesQueryTotal: number;
  truncatedQueries: number;
  nppesErrors: string[];
  seenNpis: string[];
}

export function emptyCursor(): IngestCursor {
  return { phase: 'nppes', zipIndex: 0, searchIndex: 0, skip: 0 };
}

export function emptySummary(nppesQueryTotal: number): IngestSummary {
  return {
    npisUpserted: 0,
    npisCreated: 0,
    npisUpdated: 0,
    placesMatched: 0,
    placesUnmatched: 0,
    quarantined: 0,
    duplicatesFlagged: 0,
    duplicateClusters: 0,
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
  const allowed: IngestPhase[] = ['nppes', 'places', 'duplicates', 'done'];
  return {
    phase: allowed.includes(phase as IngestPhase) ? (phase as IngestPhase) : 'nppes',
    zipIndex: numberField(row.zipIndex),
    searchIndex: numberField(row.searchIndex),
    skip: numberField(row.skip),
  };
}

export function parseSummary(value: unknown): IngestSummary {
  const row = value && typeof value === 'object' ? (value as Partial<IngestSummary>) : {};
  const base = emptySummary(numberField(row.nppesQueryTotal));
  return {
    ...base,
    npisUpserted: numberField(row.npisUpserted),
    npisCreated: numberField(row.npisCreated),
    npisUpdated: numberField(row.npisUpdated),
    placesMatched: numberField(row.placesMatched),
    placesUnmatched: numberField(row.placesUnmatched),
    quarantined: numberField(row.quarantined),
    duplicatesFlagged: numberField(row.duplicatesFlagged),
    duplicateClusters: numberField(row.duplicateClusters),
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
