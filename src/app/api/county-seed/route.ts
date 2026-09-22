import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/org';
import { listCounties, getCounty } from '@/lib/nppes/counties';
import { advanceCountyIngest, createOrResumeRun, latestRun, presentRun } from '@/lib/ingest/advance';
import { TAXONOMY_ALLOW_LIST } from '@/lib/nppes/taxonomies';

export const dynamic = 'force-dynamic';

function countyPayload() {
  return listCounties().map((county) => ({
    id: county.id,
    name: county.name,
    state: county.state,
    fips: county.fips,
    zipCount: county.zips.length,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const countyId = request.nextUrl.searchParams.get('countyId') || 'lenoir-nc';
    const county = getCounty(countyId);
    const latest = await latestRun(county.id);
    const placesPending = latest
      ? await prisma.referralSource.count({
          where: {
            organizationId: DEFAULT_ORGANIZATION_ID,
            countyFips: latest.countyFips,
            placesMatchStatus: 'pending',
          },
        })
      : 0;
    return NextResponse.json({
      counties: countyPayload(),
      taxonomyCount: TAXONOMY_ALLOW_LIST.length,
      latestRun: latest ? presentRun(latest) : null,
      placesPending,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load the referral source pull';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      countyId?: string;
      runId?: string;
      mode?: 'continue' | 'refresh';
      clinicLocationId?: string | null;
    };
    const countyId = body.countyId || 'lenoir-nc';
    getCounty(countyId);
    const mode = body.mode === 'continue' ? 'continue' : 'refresh';
    const clinicLocationId = typeof body.clinicLocationId === 'string' ? body.clinicLocationId.trim() : '';
    const run = await createOrResumeRun({ countyId, mode, runId: body.runId });
    const step = await advanceCountyIngest(run.id, {
      clinicLocationId: clinicLocationId || null,
    });
    return NextResponse.json(step);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Referral source pull failed';
    const status =
      message.startsWith('Unknown county') ||
      message.includes('not found') ||
      message === 'Clinic not found'
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
