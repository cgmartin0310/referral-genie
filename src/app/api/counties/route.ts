import { NextRequest, NextResponse } from 'next/server';
import { countiesInState, listStateOptions, seedCountyIdForFips } from '@/lib/geo/us-counties';
import { countyMarketForFips } from '@/lib/nppes/counties';
import { keptTaxonomyFilter } from '@/lib/ingest/npi-file';
import { pulledCodes } from '@/lib/catalog-settings';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  if (!state) {
    return NextResponse.json({ states: listStateOptions() });
  }

  const query = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  let counties = countiesInState(state);
  // Providers on the loaded NPI file, per county in this state.
  const onFile = new Map<string, number>();
  try {
    const groups = await prisma.npiRecord.groupBy({
      by: ['countyFips'],
      where: { state: state.trim().toUpperCase(), countyFips: { not: null }, ...keptTaxonomyFilter(await pulledCodes()) },
      _count: { _all: true },
    });
    for (const group of groups) if (group.countyFips) onFile.set(group.countyFips, group._count._all);
  } catch (error) {
    console.error('NPI file counts unavailable:', error);
  }
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
        npiRecords: onFile.get(county.fips) ?? 0,
      };
    }),
  });
}
