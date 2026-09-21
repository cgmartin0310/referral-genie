import { hitFromApiResult, type ApiResult } from "../api-shape.js";
import type { CountyMarket } from "../counties.js";
import type { QueryLog, RawHit } from "../types.js";

export const NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/";
const PAGE_SIZE = 200;
const MAX_SKIP = 1000;

interface ApiPage {
  result_count?: number;
  results?: ApiResult[];
  Errors?: { description?: string; field?: string; number?: string }[];
  errors?: { description?: string }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(params: Record<string, string>, attempt = 1): Promise<ApiPage> {
  const url = new URL(NPPES_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "referral-genie-nppes-spike/0.1 (county address-quality spike; no bulk upsert)",
    },
    signal: AbortSignal.timeout(45_000),
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await sleep(1000 * attempt);
    return fetchPage(params, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`NPPES API HTTP ${response.status} for ${url.pathname}${url.search}`);
  }
  return (await response.json()) as ApiPage;
}

export async function fetchCountyFromApi(options: {
  county: CountyMarket;
  searches: string[];
  delayMs: number;
  onProgress?: (message: string) => void;
}): Promise<{ hits: RawHit[]; queries: QueryLog[] }> {
  const hits: RawHit[] = [];
  const queries: QueryLog[] = [];
  const progress = options.onProgress ?? (() => undefined);
  let requestIndex = 0;
  const total = options.county.zips.length * options.searches.length;

  for (const zip of options.county.zips) {
    for (const search of options.searches) {
      requestIndex += 1;
      const log: QueryLog = { search, zip: zip.zip, pages: 0, rows: 0, truncated: false, error: null };
      let skip = 0;
      try {
        while (true) {
          if (options.delayMs > 0) await sleep(options.delayMs);
          const page = await fetchPage({
            version: "2.1",
            taxonomy_description: search,
            postal_code: zip.zip,
            address_purpose: "LOCATION",
            state: options.county.state,
            limit: String(PAGE_SIZE),
            skip: String(skip),
          });
          log.pages += 1;
          const apiErrors = page.Errors ?? page.errors;
          if (apiErrors && apiErrors.length > 0 && !(page.results && page.results.length > 0)) {
            log.error = apiErrors.map((item) => item.description ?? "API error").join("; ");
            break;
          }
          const results = page.results ?? [];
          log.rows += results.length;
          for (const result of results) {
            const hit = hitFromApiResult(result);
            if (hit.npi) hits.push(hit);
          }
          if (results.length < PAGE_SIZE) break;
          if (skip >= MAX_SKIP) {
            log.truncated = true;
            break;
          }
          skip += PAGE_SIZE;
        }
      } catch (error) {
        log.error = error instanceof Error ? error.message : String(error);
      }
      queries.push(log);
      progress(
        `[${requestIndex}/${total}] ${zip.zip} "${search}" rows=${log.rows} pages=${log.pages}${log.truncated ? " TRUNCATED" : ""}${log.error ? ` ERROR ${log.error}` : ""}`,
      );
    }
  }

  return { hits, queries };
}
