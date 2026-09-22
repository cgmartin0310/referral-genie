import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/org';
import { practiceInclude, presentPractice } from '@/lib/practices/present';
import { sumEstimates } from '@/lib/practices/estimate';

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

    const where: Prisma.PracticeWhereInput = {
      organizationId: DEFAULT_ORGANIZATION_ID,
      ...(countyFips ? { countyFips } : {}),
      ...(hasFax ? { faxNumber: { not: null } } : {}),
      ...(clinicId ? { clinicPractices: { some: { clinicLocationId: clinicId } } } : {}),
      ...(notOnClinicId ? { clinicPractices: { none: { clinicLocationId: notOnClinicId } } } : {}),
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
        where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: { not: null } },
        _count: { _all: true },
        orderBy: { countyName: 'asc' },
      }),
    ]);

    const practices = rows.map(presentPractice);
    const estimate = sumEstimates(practices.map((practice) => practice.estimate));

    return NextResponse.json({
      practices,
      totals: {
        practices: practices.length,
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
    console.error('Error listing practices:', error);
    return NextResponse.json({ error: 'Failed to load referral sources' }, { status: 500 });
  }
}
