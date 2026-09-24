import { currentTenant, tenantErrorResponse, requireParagon } from '@/lib/tenant';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { practiceUrl } from '@/lib/research/html';
import { readResearchLlmConfig, researchConfigMessage } from '@/lib/research/llm';
import {
  advanceResearchRun,
  assertSource,
  clinicScope,
  countyScope,
  createOrResumeResearchRun,
  latestResearchRun,
  presentResearchRun,
  sourceIdsForClinic,
  sourceIdsForCounty,
  sourceScope,
  type ResearchRunView,
} from '@/lib/research/advance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const clinicId = request.nextUrl.searchParams.get('clinicId');
    const sourceId = request.nextUrl.searchParams.get('sourceId');
    const countyFips = request.nextUrl.searchParams.get('countyFips')?.trim() || null;
    if (!clinicId && !sourceId && !countyFips) {
      return NextResponse.json({ error: 'Choose a clinic, a county, or a referral source.' }, { status: 400 });
    }
    const scopeKey = sourceId
      ? sourceScope(sourceId)
      : clinicId
        ? clinicScope(clinicId)
        : countyScope(countyFips as string);
    if (sourceId) await assertSource(sourceId);
    const counts = sourceId
      ? await sourceCounts(sourceId)
      : clinicId
        ? await clinicCounts(clinicId)
        : await countsForIds(await sourceIdsForCounty(countyFips as string));
    let latestRun: ResearchRunView | null = null;
    let runError: string | null = null;
    try {
      const latest = await latestResearchRun(scopeKey);
      latestRun = latest ? presentResearchRun(latest) : null;
    } catch (error) {
      const denied = tenantErrorResponse(error);
      if (denied) return denied;
      console.error('Error loading research run:', error);
      runError = error instanceof Error ? error.message : 'Failed to load the latest research run';
    }
    return NextResponse.json({
      ...counts,
      latestRun,
      runError,
      configError: readResearchLlmConfig() ? null : researchConfigMessage(),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    const message = error instanceof Error ? error.message : 'Failed to load research';
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant);
    const body = await request.json() as {
      clinicId?: string;
      sourceId?: string;
      countyFips?: string;
      runId?: string;
      mode?: 'continue' | 'refresh';
    };
    const countyFips = body.countyFips?.trim() || null;
    if (!body.clinicId && !body.sourceId && !countyFips) {
      return NextResponse.json({ error: 'Choose a clinic, a county, or a referral source.' }, { status: 400 });
    }
    const scopeKey = body.sourceId
      ? sourceScope(body.sourceId)
      : body.clinicId
        ? clinicScope(body.clinicId)
        : countyScope(countyFips as string);
    const sourceIds = body.sourceId
      ? [body.sourceId]
      : body.clinicId
        ? await sourceIdsForClinic(body.clinicId)
        : await sourceIdsForCounty(countyFips as string);
    if (body.sourceId) await assertSource(body.sourceId);
    const mode = body.mode === 'continue' ? 'continue' : 'refresh';
    const run = await createOrResumeResearchRun({
      scopeKey,
      mode,
      runId: body.runId,
      sourceIds,
    });
    const step = await advanceResearchRun(run.id);
    return NextResponse.json(step);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    const message = error instanceof Error ? error.message : 'Research failed';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function clinicCounts(clinicId: string): Promise<{ sourceCount: number; withWebsite: number }> {
  return countsForIds(await sourceIdsForClinic(clinicId));
}

async function countsForIds(ids: string[]): Promise<{ sourceCount: number; withWebsite: number }> {
  if (ids.length === 0) return { sourceCount: 0, withWebsite: 0 };
  const rows = await prisma.referralSource.findMany({
    where: { organizationId: CATALOG_ORGANIZATION_ID, id: { in: ids } },
    select: { website: true },
  });
  return {
    sourceCount: rows.length,
    withWebsite: rows.filter((row) => practiceUrl(row.website)).length,
  };
}

async function sourceCounts(sourceId: string): Promise<{ sourceCount: number; withWebsite: number }> {
  const row = await prisma.referralSource.findFirst({
    where: { id: sourceId, organizationId: CATALOG_ORGANIZATION_ID },
    select: { website: true },
  });
  return { sourceCount: row ? 1 : 0, withWebsite: row && practiceUrl(row.website) ? 1 : 0 };
}
