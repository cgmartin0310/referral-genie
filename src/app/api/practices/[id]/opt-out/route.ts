import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/**
 * Record or remove a fax opt-out. A request to stop arrives on a
 * subscriber's opt-out line, so any subscriber may record it; it then holds
 * for every subscriber. Only Paragon removes one.
 * Body: { optedOut: boolean }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const body = (await request.json()) as { optedOut?: unknown };
    if (typeof body.optedOut !== 'boolean') {
      return NextResponse.json({ error: 'Say optedOut: true or false' }, { status: 400 });
    }
    if (!body.optedOut) requireParagon(tenant, 'Only Paragon can remove a fax opt-out.');

    const practice = await prisma.practice.findFirst({
      where: { id, organizationId: CATALOG_ORGANIZATION_ID },
      select: { id: true },
    });
    if (!practice) return NextResponse.json({ error: 'Referral source not found' }, { status: 404 });

    const updated = await prisma.practice.update({
      where: { id },
      data: body.optedOut
        ? { faxOptOutAt: new Date(), faxOptOutBy: tenant.organizationName }
        : { faxOptOutAt: null, faxOptOutBy: null },
      select: { id: true, faxOptOutAt: true, faxOptOutBy: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error recording fax opt-out:', error);
    return NextResponse.json({ error: 'Failed to record the opt-out' }, { status: 500 });
  }
}
