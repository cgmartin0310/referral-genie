import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { acquisitionCodes } from '@/lib/nppes/taxonomies';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { CO_STAGES } from '@/lib/acquisition/stages';

export const dynamic = 'force-dynamic';

/**
 * Clinic-owner leads with counts per stage, and the counties that have
 * therapists on the NPI file. Query: countyFips, stage, pediatric=1
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'Clinic-owner leads are for Paragon.');
    const params = request.nextUrl.searchParams;
    const countyFips = params.get('countyFips')?.trim() || null;
    const stage = params.get('stage');
    const pediatric = params.get('pediatric') === '1';
    const base = { retiredAt: null, ...(countyFips ? { countyFips } : {}) };
    const [leads, counts, onFile, pulled] = await Promise.all([
      prisma.coLead.findMany({
        where: { ...base, ...(CO_STAGES.some((row) => row.key === stage) ? { stage: stage as string } : {}), ...(pediatric ? { pediatric: true } : {}) },
        orderBy: [{ name: 'asc' }],
        take: 500,
      }),
      prisma.coLead.groupBy({ by: ['stage'], where: base, _count: { _all: true } }),
      prisma.npiRecord.groupBy({
        by: ['countyFips'],
        where: { primaryTaxonomyCode: { in: [...acquisitionCodes()] }, countyFips: { not: null } },
        _count: { _all: true },
      }),
      prisma.coLead.groupBy({ by: ['countyFips', 'countyName'], where: { retiredAt: null }, _count: { _all: true } }),
    ]);
    const byStage = Object.fromEntries(CO_STAGES.map((row) => [row.key, 0]));
    for (const row of counts) byStage[row.stage] = row._count._all;
    const size = (lead: (typeof leads)[number]) => {
      const t = lead.therapists as { pt?: number; ot?: number; st?: number };
      return (t.pt ?? 0) + (t.ot ?? 0) + (t.st ?? 0);
    };
    return NextResponse.json({
      leads: leads.sort((left, right) => size(right) - size(left) || left.name.localeCompare(right.name)),
      byStage,
      pulledCounties: pulled.map((row) => ({ fips: row.countyFips, name: row.countyName, leads: row._count._all })),
      therapistsOnFile: Object.fromEntries(onFile.map((row) => [row.countyFips, row._count._all])),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error listing clinic-owner leads:', error);
    return NextResponse.json({ error: 'Failed to load clinic-owner leads' }, { status: 500 });
  }
}
