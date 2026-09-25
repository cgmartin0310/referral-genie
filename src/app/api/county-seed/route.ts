import { currentTenant, tenantErrorResponse, requireParagon } from '@/lib/tenant';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { listCounties, getCounty } from '@/lib/nppes/counties';
import { advanceCountyIngest, createOrResumeRun, latestRun, presentRun } from '@/lib/ingest/advance';
import { pulledCodes } from '@/lib/catalog-settings';
import { fillListsForCounty } from '@/lib/referral-list/market';

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
    const tenant = await currentTenant();
    const countyId = request.nextUrl.searchParams.get('countyId') || 'lenoir-nc';
    const county = getCounty(countyId);
    const latest = await latestRun(county.id);
    const placesPending = latest
      ? await prisma.referralSource.count({
          where: {
            organizationId: CATALOG_ORGANIZATION_ID,
            countyFips: latest.countyFips,
            placesMatchStatus: 'pending',
          },
        })
      : 0;
    return NextResponse.json({
      counties: countyPayload(),
      taxonomyCount: (await pulledCodes()).size,
      latestRun: latest ? presentRun(latest) : null,
      placesPending,
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    const message = error instanceof Error ? error.message : 'Failed to load the referral source pull';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant);
    const body = (await request.json()) as {
      countyId?: string;
      runId?: string;
      mode?: 'continue' | 'refresh';
    };
    const countyId = body.countyId || 'lenoir-nc';
    getCounty(countyId);
    const mode = body.mode === 'continue' ? 'continue' : 'refresh';
    const run = await createOrResumeRun({ countyId, mode, runId: body.runId });
    const step = await advanceCountyIngest(run.id);
    // Every clinic whose market includes the county gets its practices.
    if (step.run.status === 'COMPLETED') await fillListsForCounty(step.run.countyFips);
    return NextResponse.json(step);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    const message = error instanceof Error ? error.message : 'Referral source pull failed';
    const status = message.startsWith('Unknown county') || message.includes('not found') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
