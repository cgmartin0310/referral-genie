import { NextResponse } from 'next/server';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Who the signed-in person acts for, so pages show only what they can do. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    return NextResponse.json({
      organizationName: tenant.organizationName,
      role: tenant.role,
      isParagon: tenant.isParagon,
      via: tenant.via,
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error resolving the signed-in organization:', error);
    return NextResponse.json({ error: 'Failed to load your organization' }, { status: 500 });
  }
}
