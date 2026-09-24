import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { practiceIncludeFor, presentPractice, presentProvider } from '@/lib/practices/present';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { sumEstimates } from '@/lib/practices/estimate';
import { loadEstimateRates } from '@/lib/practices/estimate-settings';
import { addressClusterKey } from '@/lib/ingest/duplicates';

export const dynamic = 'force-dynamic';

/**
 * Referral sources as practices, with their providers nested and the clinics
 * each one is already listed for.
 *
 * Query: countyFips, hasFax=1, clinicId (only practices on that clinic's
 * list), notOnClinicId (only practices not yet on that clinic's list), q.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const countyFips = params.get('countyFips')?.trim() || null;
    const hasFax = params.get('hasFax') === '1';
    const clinicId = params.get('clinicId')?.trim() || null;
    const notOnClinicId = params.get('notOnClinicId')?.trim() || null;
    const q = params.get('q')?.trim() || null;
    const deleted = params.get('deleted') === '1';
    const tenant = await currentTenant();
    const rates = await loadEstimateRates(tenant.organizationId);
    const practiceInclude = practiceIncludeFor(tenant.organizationId);

    if (deleted) {
      // Deleting and restoring catalog rows is Paragon's.
      requireParagon(tenant);
      // What a person deleted or removed, for restoring.
      const [rows, providers] = await Promise.all([
        prisma.practice.findMany({
          where: { organizationId: CATALOG_ORGANIZATION_ID, hiddenAt: { not: null } },
          include: practiceInclude,
          orderBy: { hiddenAt: 'desc' },
        }),
        prisma.provider.findMany({
          where: { organizationId: CATALOG_ORGANIZATION_ID, hiddenAt: { not: null } },
          include: { practice: { select: { id: true, name: true, faxNumber: true } } },
          orderBy: { hiddenAt: 'desc' },
        }),
      ]);
      return NextResponse.json({
        practices: rows.map((row) => presentPractice(row, rates)),
        providers: providers.map((provider) => presentProvider(provider, provider.practice)),
      });
    }

    const where: Prisma.PracticeWhereInput = {
      organizationId: CATALOG_ORGANIZATION_ID,
      hiddenAt: null,
      // A clinic's own list still shows a row a later pull retired; the catalog does not.
      ...(clinicId ? {} : { retiredAt: null }),
      ...(countyFips ? { countyFips } : {}),
      ...(hasFax ? { faxNumber: { not: null } } : {}),
      ...(clinicId ? { clinicPractices: { some: { clinicLocationId: clinicId, organizationId: tenant.organizationId } } } : {}),
      ...(notOnClinicId ? { clinicPractices: { none: { clinicLocationId: notOnClinicId, organizationId: tenant.organizationId } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { address: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { providers: { some: { name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [rows, counties] = await Promise.all([
      prisma.practice.findMany({
        where,
        include: practiceInclude,
        orderBy: [{ providerCount: 'desc' }, { name: 'asc' }],
      }),
      prisma.practice.groupBy({
        by: ['countyFips', 'countyName'],
        where: { organizationId: CATALOG_ORGANIZATION_ID, countyFips: { not: null }, retiredAt: null, hiddenAt: null },
        _count: { _all: true },
        orderBy: { countyName: 'asc' },
      }),
    ]);

    const practices = rows.map((row) => presentPractice(row, rates));
    const estimate = sumEstimates(practices.map((practice) => practice.estimate));

    return NextResponse.json({
      practices,
      totals: {
        practices: practices.length,
        // Rows that group providers: an organization NPI or a shared Places listing.
        organizations: practices.filter((practice) => practice.kind !== 'provider').length,
        providers: practices.reduce((sum, practice) => sum + practice.providerCount, 0),
        withFax: practices.filter((practice) => practice.faxNumber).length,
        estimate,
      },
      counties: counties.map((row) => ({
        fips: row.countyFips,
        name: row.countyName,
        practices: row._count._all,
      })),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error listing practices:', error);
    return NextResponse.json({ error: 'Failed to load referral sources' }, { status: 500 });
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Add a practice by hand, for a referral source that has no NPI. */
export async function POST(request: NextRequest) {
  try {
    // A hand-added practice joins the shared catalog, which is Paragon's to change.
    const tenant = await currentTenant();
    requireParagon(tenant);
    const body = (await request.json()) as Record<string, unknown>;
    const name = text(body.name);
    if (!name) return NextResponse.json({ error: 'Practice name is required' }, { status: 400 });

    const address = text(body.address);
    const zipCode = text(body.zipCode);
    const practiceKey = addressClusterKey(address, zipCode, text(body.city)) ?? `manual:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    const existing = await prisma.practice.findUnique({
      where: { organizationId_practiceKey: { organizationId: CATALOG_ORGANIZATION_ID, practiceKey } },
      select: { id: true, name: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `That address is already listed as ${existing.name}` },
        { status: 409 },
      );
    }

    const created = await prisma.practice.create({
      data: {
        organizationId: CATALOG_ORGANIZATION_ID,
        practiceKey,
        name,
        address,
        city: text(body.city),
        state: text(body.state)?.toUpperCase() ?? null,
        zipCode,
        phone: text(body.phone),
        faxNumber: text(body.faxNumber),
        providerCount: 0,
        taxonomyMix: {},
      },
      include: practiceIncludeFor(tenant.organizationId),
    });
    return NextResponse.json(presentPractice(created, await loadEstimateRates(tenant.organizationId)), { status: 201 });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error creating practice:', error);
    return NextResponse.json({ error: 'Failed to add the practice' }, { status: 500 });
  }
}
