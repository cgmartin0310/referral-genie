import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { presentMarketCounty, resolveMarketFips } from '@/lib/geo/market';

export const dynamic = 'force-dynamic';

async function loadClinic(id: string, organizationId: string) {
  return prisma.clinicLocation.findFirst({
    where: { id, organizationId: organizationId },
    include: {
      marketCounties: {
        orderBy: [{ state: 'asc' }, { countyName: 'asc' }],
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinic = await loadClinic(id, tenant.organizationId);
    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    return NextResponse.json({
      clinicId: clinic.id,
      counties: clinic.marketCounties.map((row) => presentMarketCounty(row)),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error fetching clinic market:', error);
    return NextResponse.json({ error: 'Failed to load the market' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinic = await loadClinic(id, tenant.organizationId);
    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const body = await request.json();
    const resolved = resolveMarketFips(body?.fips);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.clinicMarketCounty.deleteMany({ where: { clinicLocationId: clinic.id } });
      if (resolved.counties.length > 0) {
        await tx.clinicMarketCounty.createMany({
          data: resolved.counties.map((county) => ({
            clinicLocationId: clinic.id,
            countyFips: county.fips,
            countyName: county.name,
            state: county.state,
          })),
        });
      }
    });

    const saved = await prisma.clinicMarketCounty.findMany({
      where: { clinicLocationId: clinic.id },
      orderBy: [{ state: 'asc' }, { countyName: 'asc' }],
    });

    return NextResponse.json({
      clinicId: clinic.id,
      counties: saved.map((row) => presentMarketCounty(row)),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error saving clinic market:', error);
    return NextResponse.json({ error: 'Failed to save the market' }, { status: 500 });
  }
}
