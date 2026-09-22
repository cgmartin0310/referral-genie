import { NextRequest, NextResponse } from 'next/server';
import { countiesInState, listStateOptions, seedCountyIdForFips } from '@/lib/geo/us-counties';
import { countyMarketForFips } from '@/lib/nppes/counties';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  if (!state) {
    return NextResponse.json({ states: listStateOptions() });
  }

  const query = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  let counties = countiesInState(state);
  if (query) {
    counties = counties.filter((county) => county.name.toLowerCase().includes(query));
  }

  return NextResponse.json({
    counties: counties.map((county) => {
      const seedCountyId = seedCountyIdForFips(county.fips);
      return {
        fips: county.fips,
        name: county.name,
        state: county.state,
        pullReady: seedCountyId !== null,
        seedCountyId,
        zipCount: countyMarketForFips(county.fips)?.zips.length ?? 0,
      };
    }),
  });
}
