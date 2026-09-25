import { NextRequest, NextResponse } from 'next/server';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { parseTier } from '@/lib/referral-list/tiers';
import { scorablePracticeIds, setScores } from '@/lib/referral-list/scores';

function idList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];
}

/**
 * Score practices for the whole company: the score sets their outreach.
 * Body: { practiceIds, tier: trusted | warm | cold | not_fit | null (clear) }.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const body = (await request.json().catch(() => ({}))) as { practiceIds?: unknown; tier?: unknown };
    const requested = idList(body.practiceIds);
    if (requested.length === 0) return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });
    const tier = parseTier(body.tier);
    if (body.tier !== null && !tier) return NextResponse.json({ error: 'Choose Trusted, Warm, Cold, or Not a fit.' }, { status: 400 });
    const practiceIds = await scorablePracticeIds(tenant.organizationId, requested);
    const updated = await setScores(tenant.organizationId, practiceIds, tier, tenant.actor);
    return NextResponse.json({ updated, tier, skipped: requested.length - practiceIds.length });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error saving scores:', error);
    return NextResponse.json({ error: 'Failed to save the score' }, { status: 500 });
  }
}
