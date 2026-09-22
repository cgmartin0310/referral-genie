import { getCounty } from "./counties.js";
import { buildReport } from "./metrics.js";
import { normalizeHits } from "./normalize.js";
import { writeReport } from "./report.js";
import { TAXONOMY_SEARCHES } from "./taxonomies.js";
import type { QueryLog, SpikeSource } from "./types.js";
import { fetchCountyFromApi } from "./sources/api.js";
import { NPPES_API_URL } from "./sources/api.js";
import { loadDisseminationHits } from "./sources/dissemination.js";
import { loadFixtureHits } from "./sources/fixture.js";

export interface RunOptions {
  source: SpikeSource;
  countyId: string;
  outDir: string;
  fixturePath?: string;
  filePath?: string;
  delayMs?: number;
  onProgress?: (message: string) => void;
}

export async function runSpike(options: RunOptions) {
  const county = getCounty(options.countyId);
  let queries: QueryLog[] = [];
  let sourceDetail = "";
  let hits;

  if (options.source === "fixture") {
    if (!options.fixturePath) throw new Error("Fixture path is required");
    sourceDetail = options.fixturePath;
    hits = await loadFixtureHits(options.fixturePath);
  } else if (options.source === "file") {
    if (!options.filePath) throw new Error("CSV path is required for --file");
    sourceDetail = options.filePath;
    hits = await loadDisseminationHits(options.filePath);
  } else {
    sourceDetail = `${NPPES_API_URL}?version=2.1`;
    const pulled = await fetchCountyFromApi({
      county,
      searches: TAXONOMY_SEARCHES.map((row) => row.search),
      delayMs: options.delayMs ?? 250,
      onProgress: options.onProgress,
    });
    hits = pulled.hits;
    queries = pulled.queries;
  }

  const report = buildReport({
    hits,
    county,
    source: options.source,
    sourceDetail,
    queries,
  });
  const providers = normalizeHits(hits, county).providers;
  await writeReport(options.outDir, report, providers);
  return { report, providers };
}
