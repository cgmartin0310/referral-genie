import { hitFromApiResult, type ApiResult } from './api-shape';
import type { RawHit } from './types';

export const NPPES_API_URL = 'https://npiregistry.cms.hhs.gov/api/';
export const NPPES_PAGE_SIZE = 200;
export const NPPES_MAX_SKIP = 1000;

export interface NppesPage {
  results: RawHit[];
  /** Unfiltered result rows in this page. Used to decide whether to request the next skip. */
  rawCount: number;
  error: string | null;
}

interface ApiPage {
  result_count?: number;
  results?: ApiResult[];
  Errors?: { description?: string }[];
  errors?: { description?: string }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchNppesPage(input: {
  /** Omit to scan every NPI in the ZIP; rows are kept by taxonomy code locally. */
  taxonomyDescription?: string | null;
  postalCode: string;
  state: string;
  skip: number;
  timeoutMs?: number;
}): Promise<NppesPage> {
  const url = new URL(NPPES_API_URL);
  url.searchParams.set('version', '2.1');
  if (input.taxonomyDescription) url.searchParams.set('taxonomy_description', input.taxonomyDescription);
  url.searchParams.set('postal_code', input.postalCode);
  url.searchParams.set('address_purpose', 'LOCATION');
  url.searchParams.set('state', input.state);
  url.searchParams.set('limit', String(NPPES_PAGE_SIZE));
  url.searchParams.set('skip', String(input.skip));

  let response: Response | null = null;
  let lastError = 'NPPES request failed';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'referral-genie/1.0 (NPI referral source pull)',
        },
        signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await sleep(500 * attempt);
        continue;
      }
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3) {
        await sleep(500 * attempt);
        continue;
      }
      throw new Error(lastError);
    }
  }

  if (!response) throw new Error(lastError);
  if (!response.ok) {
    throw new Error(`NPPES API HTTP ${response.status}`);
  }

  const page = (await response.json()) as ApiPage;
  const apiErrors = page.Errors ?? page.errors;
  const rawCount = page.results?.length ?? 0;
  const results = (page.results ?? []).map((row) => hitFromApiResult(row)).filter((hit) => hit.npi);
  if (apiErrors && apiErrors.length > 0 && results.length === 0) {
    return {
      results: [],
      rawCount,
      error: apiErrors.map((item) => item.description ?? 'API error').join('; '),
    };
  }

  return { results, rawCount, error: null };
}
