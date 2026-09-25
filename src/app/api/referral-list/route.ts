import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { practiceIncludeFor, presentPractice } from '@/lib/practices/present';
import { ratesForDisciplines } from '@/lib/practices/estimate';
import { loadEstimateRates } from '@/lib/practices/estimate-settings';
import { parseTier, TIERS } from '@/lib/referral-list/tiers';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 3000;

function idList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];
}

/**
 * Your Sources: every practice on the subscriber's clinic referral lists,
 * with its tier. Query: clinicId, tier (trusted, warm, cold, not_fit, or
 * unscored), q. Counts by tier cover the clinic filter, not the tier or search.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const params = request.nextUrl.searchParams;
    const clinicId = params.get('clinicId')?.trim() || null;
    const tierParam = params.get('tier');
    const q = params.get('q')?.trim() || null;

    const clinics = await prisma.clinicLocation.findMany({
      where: { organizationId: tenant.organizationId },
      select: { id: true, name: true, disciplines: true },
      orderBy: { name: 'asc' },
    });
    const scope: Prisma.ClinicPracticeWhereInput = {
      organizationId: tenant.organizationId,
      practice: { hiddenAt: null },
      ...(clinicId ? { clinicLocationId: clinicId } : {}),
    };
    const tierWhere: Prisma.ClinicPracticeWhereInput =
      tierParam === 'unscored' ? { tier: null } : parseTier(tierParam) ? { tier: tierParam } : {};
    const search: Prisma.ClinicPracticeWhereInput = q
      ? {
          practice: {
            hiddenAt: null,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { address: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { providers: { some: { name: { contains: q, mode: 'insensitive' }, hiddenAt: null } } },
            ],
          },
        }
      : {};

    const [rows, grouped] = await Promise.all([
      prisma.clinicPractice.findMany({
        where: { AND: [scope, tierWhere, search] },
        include: { practice: { include: practiceIncludeFor(tenant.organizationId) }, clinicLocation: { select: { id: true, name: true } } },
        orderBy: [{ practice: { providerCount: 'desc' } }, { practice: { name: 'asc' } }],
        take: MAX_ROWS,
      }),
      prisma.clinicPractice.groupBy({ by: ['tier'], where: scope, _count: { _all: true } }),
    ]);

    const baseRates = await loadEstimateRates(tenant.organizationId);
    const ratesByClinic = new Map(clinics.map((clinic) => [clinic.id, ratesForDisciplines(baseRates, clinic.disciplines)]));
    const counts: Record<string, number> = { all: 0, unscored: 0, ...Object.fromEntries(TIERS.map((tier) => [tier, 0])) };
    for (const row of grouped) {
      counts.all += row._count._all;
      const tier = parseTier(row.tier);
      counts[tier ?? 'unscored'] += row._count._all;
    }

    return NextResponse.json({
      clinics: clinics.map(({ id, name }) => ({ id, name })),
      counts,
      truncated: rows.length === MAX_ROWS,
      entries: rows.map((row) => ({
        id: row.id,
        clinic: row.clinicLocation,
        tier: parseTier(row.tier),
        addedFrom: row.addedFrom,
        // Added by hand (own:…): only this organization sees it. Paragon's sit in the catalog organization.
        private: row.practice.organizationId !== CATALOG_ORGANIZATION_ID || row.practice.practiceKey.startsWith('own:'),
        practice: presentPractice(row.practice, ratesByClinic.get(row.clinicLocationId) ?? baseRates),
      })),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading referral lists:', error);
    return NextResponse.json({ error: 'Failed to load your sources' }, { status: 500 });
  }
}

/** Score entries across clinics. Body: { ids: list entry ids, tier: trusted | warm | cold | not_fit | null }. */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown; tier?: unknown };
    const ids = idList(body.ids);
    if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });
    const tier = parseTier(body.tier);
    if (body.tier !== null && !tier) {
      return NextResponse.json({ error: 'Choose Trusted, Warm, Cold, or Not a fit.' }, { status: 400 });
    }
    const result = await prisma.clinicPractice.updateMany({
      where: { id: { in: ids }, organizationId: tenant.organizationId },
      data: tier ? { tier, tierSetAt: new Date(), tierSetBy: tenant.actor } : { tier: null, tierSetAt: null, tierSetBy: null },
    });
    return NextResponse.json({ updated: result.count, tier });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error scoring your sources:', error);
    return NextResponse.json({ error: 'Failed to save the score' }, { status: 500 });
  }
}
