import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { practiceIncludeFor, presentPractice } from '@/lib/practices/present';
import { ratesForDisciplines, sumEstimates } from '@/lib/practices/estimate';
import { loadEstimateRates } from '@/lib/practices/estimate-settings';
import { parseTier } from '@/lib/referral-list/tiers';

const ADDED_FROM = new Set(['market', 'manual', 'import']);

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function clinicOr404(id: string, organizationId: string) {
  return prisma.clinicLocation.findFirst({
    where: { id, organizationId: organizationId },
    select: { id: true, name: true, disciplines: true },
  });
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== ''))];
}

/** The clinic's referral list, each practice with the subscriber's tier. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinic = await clinicOr404(id, tenant.organizationId);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const rows = await prisma.clinicPractice.findMany({
      where: { clinicLocationId: id, organizationId: tenant.organizationId },
      include: { practice: { include: practiceIncludeFor(tenant.organizationId) } },
      orderBy: { practice: { providerCount: 'desc' } },
    });
    // Only the disciplines this clinic offers count toward its estimates.
    const rates = ratesForDisciplines(await loadEstimateRates(tenant.organizationId), clinic.disciplines);
    const practices = rows.map((row) => ({
      ...presentPractice(row.practice, rates),
      tier: parseTier(row.tier),
      tierSetAt: row.tierSetAt?.toISOString() ?? null,
      addedFrom: row.addedFrom,
      // Added by hand and not in the shared catalog: only this subscriber sees it.
      private: row.practice.practiceKey.startsWith('own:'),
    }));
    return NextResponse.json({
      clinic,
      practices,
      totals: {
        practices: practices.length,
        providers: practices.reduce((sum, practice) => sum + practice.providerCount, 0),
        estimate: sumEstimates(practices.map((practice) => practice.estimate)),
      },
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading clinic referral list:', error);
    return NextResponse.json({ error: 'Failed to load referral list' }, { status: 500 });
  }
}

/**
 * Add practices to the clinic's list: catalog practices, or the subscriber's
 * own hand-added ones. Already-listed practices are skipped.
 * Body: { practiceIds, addedFrom?: 'market' | 'manual' | 'import' }.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinic = await clinicOr404(id, tenant.organizationId);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const body = (await request.json()) as { practiceIds?: unknown; addedFrom?: unknown };
    const practiceIds = idList(body.practiceIds);
    if (practiceIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });
    }
    const addedFrom = typeof body.addedFrom === 'string' && ADDED_FROM.has(body.addedFrom) ? body.addedFrom : 'manual';

    const valid = await prisma.practice.findMany({
      where: { id: { in: practiceIds }, organizationId: { in: [CATALOG_ORGANIZATION_ID, tenant.organizationId] } },
      select: { id: true },
    });
    const result = await prisma.clinicPractice.createMany({
      data: valid.map((row) => ({
        clinicLocationId: id,
        practiceId: row.id,
        organizationId: tenant.organizationId,
        addedFrom,
      })),
      skipDuplicates: true,
    });
    return NextResponse.json({
      added: result.count,
      alreadyListed: valid.length - result.count,
      unknown: practiceIds.length - valid.length,
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error adding practices to clinic:', error);
    return NextResponse.json({ error: 'Failed to add practices' }, { status: 500 });
  }
}

/**
 * Score practices on the clinic's list. Body: { practiceIds, tier } where tier
 * is trusted, warm, cold, not_fit, or null to clear it.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinic = await clinicOr404(id, tenant.organizationId);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const body = (await request.json()) as { practiceIds?: unknown; tier?: unknown };
    const practiceIds = idList(body.practiceIds);
    if (practiceIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });
    }
    const tier = parseTier(body.tier);
    if (body.tier !== null && !tier) {
      return NextResponse.json({ error: 'Choose Trusted, Warm, Cold, or Not a fit.' }, { status: 400 });
    }
    const result = await prisma.clinicPractice.updateMany({
      where: { clinicLocationId: id, organizationId: tenant.organizationId, practiceId: { in: practiceIds } },
      data: tier ? { tier, tierSetAt: new Date(), tierSetBy: tenant.actor } : { tier: null, tierSetAt: null, tierSetBy: null },
    });
    return NextResponse.json({ updated: result.count, tier });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error scoring practices:', error);
    return NextResponse.json({ error: 'Failed to save the score' }, { status: 500 });
  }
}

/** Remove practices from the clinic's list. The practices themselves stay. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinic = await clinicOr404(id, tenant.organizationId);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const body = (await request.json()) as { practiceIds?: unknown };
    const practiceIds = idList(body.practiceIds);
    if (practiceIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });
    }
    // A practice the market put on the list is kept as Not a fit, so a later
    // pull does not add it back; anything else is removed.
    const where = { clinicLocationId: id, organizationId: tenant.organizationId, practiceId: { in: practiceIds } };
    const [kept, result] = await prisma.$transaction([
      prisma.clinicPractice.updateMany({
        where: { ...where, addedFrom: 'market' },
        data: { tier: 'not_fit', tierSetAt: new Date(), tierSetBy: tenant.actor },
      }),
      prisma.clinicPractice.deleteMany({ where: { ...where, addedFrom: { not: 'market' } } }),
    ]);
    return NextResponse.json({ removed: result.count + kept.count, markedNotFit: kept.count });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error removing practices from clinic:', error);
    return NextResponse.json({ error: 'Failed to remove practices' }, { status: 500 });
  }
}
