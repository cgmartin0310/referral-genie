import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { OUTREACH_STAGES, isStage } from '@/lib/universe';

export const dynamic = 'force-dynamic';

/**
 * Paragon's Source Universe: every catalog practice with its outreach stage,
 * referral coordinator, and assignee, with counts per stage.
 * Query: countyFips, stage, q
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The Source Universe is for Paragon.');
    const params = request.nextUrl.searchParams;
    const countyFips = params.get('countyFips')?.trim() || null;
    const stage = params.get('stage');
    const q = params.get('q')?.trim() || null;
    const base = {
      organizationId: CATALOG_ORGANIZATION_ID,
      hiddenAt: null,
      retiredAt: null,
      providerCount: { gt: 0 },
      ...(countyFips ? { countyFips } : {}),
    };
    const [rows, counts, counties, chainNames] = await Promise.all([
      prisma.practice.findMany({
        where: {
          ...base,
          ...(isStage(stage) ? { outreachStage: stage } : {}),
          ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { city: { contains: q, mode: 'insensitive' as const } }] } : {}),
        },
        orderBy: [{ providerCount: 'desc' }, { name: 'asc' }],
        take: 500,
        select: {
          id: true, name: true, address: true, city: true, countyName: true, providerCount: true, taxonomyMix: true,
          faxNumber: true, phone: true, faxOptOutAt: true, outreachStage: true, stageChangedAt: true,
          rcName: true, rcPhone: true, rcEmail: true, assignee: true,
        },
      }),
      prisma.practice.groupBy({ by: ['outreachStage'], where: base, _count: { _all: true } }),
      prisma.practice.groupBy({
        by: ['countyFips', 'countyName'],
        where: { organizationId: CATALOG_ORGANIZATION_ID, hiddenAt: null, retiredAt: null, countyFips: { not: null } },
        _count: { _all: true },
        orderBy: { countyName: 'asc' },
      }),
      prisma.practice.groupBy({ by: ['name'], where: { organizationId: CATALOG_ORGANIZATION_ID, hiddenAt: null, retiredAt: null }, _count: { _all: true }, having: { name: { _count: { gt: 1 } } } }),
    ]);
    const chains = new Set(chainNames.map((row) => row.name));
    const byStage = Object.fromEntries(OUTREACH_STAGES.map((row) => [row.key, 0]));
    for (const row of counts) byStage[row.outreachStage] = row._count._all;
    return NextResponse.json({
      practices: rows.map((row) => ({ ...row, healthSystem: chains.has(row.name) })),
      byStage,
      counties: counties.map((row) => ({ fips: row.countyFips, name: row.countyName, practices: row._count._all })),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading the Source Universe:', error);
    return NextResponse.json({ error: 'Failed to load the Source Universe' }, { status: 500 });
  }
}
