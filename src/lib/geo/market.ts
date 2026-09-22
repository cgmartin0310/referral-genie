import type { MarketCountyView } from './market-view';
import { getUsCounty, seedCountyIdForFips, type UsCounty } from './us-counties';

export const MAX_MARKET_COUNTIES = 40;

export type { MarketCountyView };

export function presentMarketCounty(row: {
  id?: string;
  countyFips: string;
  countyName: string;
  state: string;
}): MarketCountyView {
  const seedCountyId = seedCountyIdForFips(row.countyFips);
  return {
    ...(row.id ? { id: row.id } : {}),
    fips: row.countyFips,
    name: row.countyName,
    state: row.state,
    pullReady: seedCountyId !== null,
    seedCountyId,
  };
}

export function resolveMarketFips(fipsList: unknown): { counties: UsCounty[] } | { error: string } {
  if (!Array.isArray(fipsList)) {
    return { error: 'Send counties as a list of FIPS codes.' };
  }
  if (fipsList.length > MAX_MARKET_COUNTIES) {
    return { error: `Choose ${MAX_MARKET_COUNTIES} counties or fewer.` };
  }

  const seen = new Set<string>();
  const counties: UsCounty[] = [];
  for (const value of fipsList) {
    if (typeof value !== 'string' || !/^\d{5}$/.test(value)) {
      return { error: 'Each county must be a 5-digit FIPS code.' };
    }
    if (seen.has(value)) continue;
    seen.add(value);
    const county = getUsCounty(value);
    if (!county) return { error: `Unknown county FIPS ${value}.` };
    counties.push(county);
  }
  return { counties };
}
