import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/org';
import { practiceInclude, presentPractice } from '@/lib/practices/present';
import { sumEstimates } from '@/lib/practices/estimate';
import { loadEstimateRates } from '@/lib/practices/estimate-settings';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function clinicOr404(id: string) {
  return prisma.clinicLocation.findFirst({
    where: { id, organizationId: DEFAULT_ORGANIZATION_ID },
    select: { id: true, name: true },
  });
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== ''))];
}

/** The clinic's referral list: practices a person has added to it. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const clinic = await clinicOr404(id);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const rows = await prisma.clinicPractice.findMany({
      where: { clinicLocationId: id, organizationId: DEFAULT_ORGANIZATION_ID },
      include: { practice: { include: practiceInclude } },
      orderBy: { practice: { providerCount: 'desc' } },
    });
    const rates = await loadEstimateRates();
    const practices = rows.map((row) => presentPractice(row.practice, rates));
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
    console.error('Error loading clinic referral list:', error);
    return NextResponse.json({ error: 'Failed to load referral list' }, { status: 500 });
  }
}

/** Add practices to the clinic's list. Already-listed practices are skipped. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const clinic = await clinicOr404(id);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const body = (await request.json()) as { practiceIds?: unknown };
    const practiceIds = idList(body.practiceIds);
    if (practiceIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });
    }

    const valid = await prisma.practice.findMany({
      where: { id: { in: practiceIds }, organizationId: DEFAULT_ORGANIZATION_ID },
      select: { id: true },
    });
    const result = await prisma.clinicPractice.createMany({
      data: valid.map((row) => ({
        clinicLocationId: id,
        practiceId: row.id,
        organizationId: DEFAULT_ORGANIZATION_ID,
      })),
      skipDuplicates: true,
    });
    return NextResponse.json({
      added: result.count,
      alreadyListed: valid.length - result.count,
      unknown: practiceIds.length - valid.length,
    });
  } catch (error) {
    console.error('Error adding practices to clinic:', error);
    return NextResponse.json({ error: 'Failed to add practices' }, { status: 500 });
  }
}

/** Remove practices from the clinic's list. The practices themselves stay. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const clinic = await clinicOr404(id);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const body = (await request.json()) as { practiceIds?: unknown };
    const practiceIds = idList(body.practiceIds);
    if (practiceIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });
    }
    const result = await prisma.clinicPractice.deleteMany({
      where: { clinicLocationId: id, organizationId: DEFAULT_ORGANIZATION_ID, practiceId: { in: practiceIds } },
    });
    return NextResponse.json({ removed: result.count });
  } catch (error) {
    console.error('Error removing practices from clinic:', error);
    return NextResponse.json({ error: 'Failed to remove practices' }, { status: 500 });
  }
}
