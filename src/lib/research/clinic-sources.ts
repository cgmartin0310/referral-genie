import { getCounty, listCounties } from '../nppes/counties';
import { normalizeCountyFips, seedCountyIdForFips } from '../geo/us-counties';

function seedIdForToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fromFips = seedCountyIdForFips(trimmed);
  if (fromFips) return fromFips;
  return listCounties().some((county) => county.id === trimmed) ? trimmed : null;
}

/**
 * FIPS codes that identify the same referral sources a county pull writes.
 *
 * Pull stores `ReferralSource.countyFips` from the seed county list (Lenoir is
 * `37107`). A clinic market stores catalog FIPS. Those strings match when both
 * are canonical. Also accept the seed county id, ingest-run FIPS, and values
 * that normalize to the same 5-digit code.
 */
export function researchCountyFips(values: Iterable<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.add(trimmed);
    const normalized = normalizeCountyFips(trimmed);
    if (normalized) out.add(normalized);
    const seedId = seedIdForToken(trimmed);
    if (!seedId) continue;
    const ingest = getCounty(seedId).fips;
    out.add(ingest);
    const ingestNormalized = normalizeCountyFips(ingest);
    if (ingestNormalized) out.add(ingestNormalized);
  }
  return [...out].sort();
}

/** Seed county ids (for example `lenoir-nc`) for a clinic's saved market. */
export function seedIdsForMarket(values: Iterable<string | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const seedId = seedIdForToken(value);
    if (seedId) ids.add(seedId);
  }
  return [...ids].sort();
}

export function sourceIdsMatchingFips(
  rows: { id: string; countyFips: string | null }[],
  fips: readonly string[],
): string[] {
  const wanted = new Set(fips);
  const wantedNormalized = new Set(
    fips
      .map((value) => normalizeCountyFips(value))
      .filter((value): value is string => value !== null),
  );
  return rows
    .filter((row) => {
      if (!row.countyFips) return false;
      const trimmed = row.countyFips.trim();
      if (wanted.has(row.countyFips) || wanted.has(trimmed)) return true;
      const normalized = normalizeCountyFips(row.countyFips);
      return normalized !== null && wantedNormalized.has(normalized);
    })
    .map((row) => row.id);
}
