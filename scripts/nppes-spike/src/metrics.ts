import type { CountyMarket } from "./counties.js";
import { TAXONOMY_ALLOW_LIST } from "./taxonomies.js";
import { isPlacesMatchReady, normalizeHits } from "./normalize.js";
import type { AddressQuality, QueryLog, SpikeReport, SpikeSource } from "./types.js";
import type { RawHit } from "./types.js";

function countFlag(providers: { flags: string[] }[], flag: string): number {
  return providers.filter((row) => row.flags.includes(flag)).length;
}

function percent(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export function buildReport(input: {
  hits: RawHit[];
  county: CountyMarket;
  source: SpikeSource;
  sourceDetail: string;
  queries: QueryLog[];
  notes?: string[];
}): SpikeReport {
  const normalized = normalizeHits(input.hits, input.county);
  const providers = normalized.providers;
  const kept = providers.length;

  const byEnumeration: Record<string, number> = {};
  const taxonomyCounts = new Map<string, { description: string; count: number }>();
  const byGroup: Record<string, number> = {};

  for (const provider of providers) {
    const enumeration = provider.enumerationType || "unknown";
    byEnumeration[enumeration] = (byEnumeration[enumeration] ?? 0) + 1;
    const code = provider.primaryTaxonomyCode ?? "(none)";
    const description = provider.primaryTaxonomyDesc ?? "";
    const existing = taxonomyCounts.get(code);
    if (existing) existing.count += 1;
    else taxonomyCounts.set(code, { description, count: 1 });
    const group = provider.matchedGroup ?? "(ungrouped)";
    byGroup[group] = (byGroup[group] ?? 0) + 1;
  }

  const addressQuality: AddressQuality = {
    missingAddress: countFlag(providers, "missing_address"),
    missingPracticeLocation: countFlag(providers, "missing_practice_location"),
    missingStreet: countFlag(providers, "missing_street"),
    missingPhone: countFlag(providers, "missing_phone"),
    missingCity: countFlag(providers, "missing_city"),
    invalidState: countFlag(providers, "invalid_state"),
    invalidZip: countFlag(providers, "invalid_zip"),
    unparseableCityStateOrZip: countFlag(providers, "unparseable_city_state_or_zip"),
    poBox: countFlag(providers, "po_box"),
    zipOutsideCounty: countFlag(providers, "zip_outside_county"),
    boundaryZip: countFlag(providers, "boundary_zip"),
    deactivated: countFlag(providers, "deactivated"),
    matchedOnSecondaryOnly: countFlag(providers, "matched_on_secondary_only"),
    placesMatchReady: providers.filter(isPlacesMatchReady).length,
  };

  const addressQualityPercent = Object.fromEntries(
    (Object.keys(addressQuality) as (keyof AddressQuality)[]).map((key) => [
      key,
      percent(addressQuality[key], kept),
    ]),
  ) as Record<keyof AddressQuality, number>;

  const truncatedQueryCount = input.queries.filter((query) => query.truncated).length;
  const notes = [
    "This spike did not call Google Places.",
    "This spike did not read or write Prisma, and it did not upsert ReferralSource.",
    "County membership is approximated with practice-location ZIP codes. Boundary ZIPs cross county lines.",
    "The NPPES Read API returns at most 1,200 rows per taxonomy + ZIP query. Truncated queries are listed when that cap is hit; use the monthly dissemination file for a complete recount.",
    ...(input.notes ?? []),
  ];
  if (truncatedQueryCount > 0) {
    notes.push(
      `${truncatedQueryCount} API quer${truncatedQueryCount === 1 ? "y was" : "ies were"} truncated at 1,200 rows. Those counts are a lower bound.`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    source: input.source,
    sourceDetail: input.sourceDetail,
    county: {
      id: input.county.id,
      name: input.county.name,
      state: input.county.state,
      fips: input.county.fips,
    },
    taxonomyAllowListCount: TAXONOMY_ALLOW_LIST.length,
    queries: input.queries,
    rawHitCount: normalized.rawHitCount,
    uniqueNpiBeforeTaxonomyFilter: normalized.uniqueNpiBeforeTaxonomyFilter,
    duplicateNpiCount: normalized.duplicateNpiCount,
    extraDuplicateHits: normalized.extraDuplicateHits,
    droppedNotInAllowList: normalized.droppedNotInAllowList,
    keptCount: kept,
    byEnumeration,
    byPrimaryTaxonomy: [...taxonomyCounts.entries()]
      .map(([code, value]) => ({ code, description: value.description, count: value.count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    byGroup,
    addressQuality,
    addressQualityPercent,
    truncatedQueryCount,
    notes,
  };
}

export function keptProviders(hits: RawHit[], county: CountyMarket) {
  return normalizeHits(hits, county).providers;
}
