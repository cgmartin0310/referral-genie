import { NextRequest, NextResponse } from 'next/server';
import { countiesInState, listStateOptions, seedCountyIdForFips } from '@/lib/geo/us-counties';
import { countyMarketForFips } from '@/lib/nppes/counties';
import { keptTaxonomyFilter } from '@/lib/ingest/npi-file';
import { pulledCodes } from '@/lib/catalog-settings';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { taxonomyByCode } from '@/lib/nppes/taxonomies';
import { estimateMonthlyReferrals } from '@/lib/practices/estimate';
import { loadEstimateRates } from '@/lib/practices/estimate-settings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  if (!state) {
    return NextResponse.json({ states: listStateOptions() });
  }

  const query = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  let counties = countiesInState(state);
  // Providers on the loaded NPI file, per county in this state, by specialty:
  // the snapshot and estimate a county shows before anyone pulls it.
  const onFile = new Map<string, number>();
  const snapshots = new Map<string, { providers: number; organizations: number; mix: Record<string, number> }>();
  try {
    const groups = await prisma.npiRecord.groupBy({
      by: ['countyFips', 'primaryTaxonomyCode', 'entityType'],
      where: { state: state.trim().toUpperCase(), countyFips: { not: null }, ...keptTaxonomyFilter(await pulledCodes()) },
      _count: { _all: true },
    });
    for (const group of groups) {
      if (!group.countyFips) continue;
      const count = group._count._all;
      onFile.set(group.countyFips, (onFile.get(group.countyFips) ?? 0) + count);
      const snapshot = snapshots.get(group.countyFips) ?? { providers: 0, organizations: 0, mix: {} };
      if (group.entityType === '2') snapshot.organizations += count;
      else {
        snapshot.providers += count;
        const type = (group.primaryTaxonomyCode && taxonomyByCode(group.primaryTaxonomyCode)?.group) || 'unknown';
        snapshot.mix[type] = (snapshot.mix[type] ?? 0) + count;
      }
      snapshots.set(group.countyFips, snapshot);
    }
  } catch (error) {
    console.error('NPI file counts unavailable:', error);
  }
  const rates = await loadEstimateRates(CATALOG_ORGANIZATION_ID);
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
        snapshot: (() => {
          const snapshot = snapshots.get(county.fips);
          if (!snapshot) return null;
          const estimate = estimateMonthlyReferrals(snapshot.mix, rates);
          return { ...snapshot, estimate: estimate ? { low: estimate.low, high: estimate.high } : null };
        })(),
      };
    }),
  });
}
