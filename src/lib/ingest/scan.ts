import { NPPES_MAX_SKIP, NPPES_PAGE_SIZE } from '../nppes/api';
import { TAXONOMY_SEARCHES } from '../nppes/taxonomies';
import type { IngestCursor } from './summary';

/**
 * How a county is scanned on NPPES.
 *
 * NPPES's taxonomy_description search silently misses records: on Lenoir it
 * returned none of the county's eight pediatricians. So each ZIP is scanned
 * with no taxonomy filter and rows are kept by taxonomy code locally. A ZIP
 * scan is capped at 1,200 rows by the API; when a ZIP hits the cap, the
 * description searches run for that ZIP as a supplement.
 *
 * A ZIP list from the Census ZCTA crosswalk misses PO Box ZIPs that practices
 * register as their location. That is a limit of pulling by ZIP through the
 * API; the fix is loading the NPI file and mapping practice ZIP to county.
 */

/** Search index 0 is the unfiltered scan; 1..n are the description fallbacks. */
export function searchDescriptionAt(index: number): string | null {
  if (index === 0) return null;
  return TAXONOMY_SEARCHES[index - 1]?.search ?? null;
}

export function fallbackSearchCount(): number {
  return TAXONOMY_SEARCHES.length;
}

export interface PageOutcome {
  rawCount: number;
}

/**
 * Move the cursor after one page. Returns how many more queries were added
 * to the plan (description fallbacks when a ZIP hit the cap).
 */
export function advanceScanCursor(cursor: IngestCursor, zipCount: number, page: PageOutcome): { addedQueries: number; truncated: boolean } {
  const fullPage = page.rawCount >= NPPES_PAGE_SIZE;
  if (fullPage && cursor.skip < NPPES_MAX_SKIP) {
    cursor.skip += NPPES_PAGE_SIZE;
    return { addedQueries: 0, truncated: false };
  }

  let addedQueries = 0;
  let truncated = false;
  cursor.skip = 0;
  if (cursor.searchIndex === 0 && fullPage) {
    // The unfiltered scan hit the API cap: supplement with description searches.
    truncated = true;
    addedQueries = fallbackSearchCount();
    cursor.searchIndex = 1;
    return { addedQueries, truncated };
  }
  const lastIndex = cursor.searchIndex === 0 ? 0 : fallbackSearchCount();
  if (cursor.searchIndex < lastIndex) {
    cursor.searchIndex += 1;
    return { addedQueries, truncated };
  }
  cursor.searchIndex = 0;
  cursor.zipIndex += 1;
  if (cursor.zipIndex >= zipCount) cursor.phase = 'group';
  return { addedQueries, truncated };
}
