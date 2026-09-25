import { NextResponse } from 'next/server';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { marketStatus } from '@/lib/referral-list/market';

export const dynamic = 'force-dynamic';

/**
 * Whether each clinic's market counties are in: ready, being pulled, failed,
 * or unavailable. Checking starts (or resumes) the pull of any county not in yet.
 */
export async function GET() {
  try {
    const tenant = await currentTenant();
    return NextResponse.json(await marketStatus(tenant.organizationId));
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading market status:', error);
    return NextResponse.json({ error: 'Failed to load your market' }, { status: 500 });
  }
}
