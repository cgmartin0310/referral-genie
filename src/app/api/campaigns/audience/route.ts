import { NextRequest, NextResponse } from 'next/server';
import { audienceForClinic, parsePracticeIds } from '@/lib/campaigns/audience-db';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { parseAudienceTiers } from '@/lib/referral-list/tiers';

export const dynamic = 'force-dynamic';

/**
 * Preview of what a campaign to a clinic's referral list would send:
 * how many practices, how many pages, who cannot be reached.
 * Query: clinicId, tiers (comma-separated: trusted, warm, cold), or
 * practiceIds (comma-separated) for chosen practices only.
 */
export async function GET(request: NextRequest) {
  const clinicId = request.nextUrl.searchParams.get('clinicId')?.trim();
  if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
  try {
    const tenant = await currentTenant();
    const tiers = parseAudienceTiers((request.nextUrl.searchParams.get('tiers') ?? '').split(',').filter(Boolean));
    const practiceIds = parsePracticeIds(request.nextUrl.searchParams.get('practiceIds') ?? '');
    const audience = await audienceForClinic(clinicId, tenant.organizationId, tiers, practiceIds);
    if (!audience) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    return NextResponse.json(audience);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error building campaign audience:', error);
    return NextResponse.json({ error: 'Failed to build the audience' }, { status: 500 });
  }
}
