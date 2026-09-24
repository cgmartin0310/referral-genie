import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { prospectsFor } from '@/lib/prospects/db';

export const dynamic = 'force-dynamic';

/**
 * Approve or exclude prospects, or put them back to proposed. Only practices
 * that are this subscriber's prospects can be decided. Each decision records
 * who made it and when.
 * Body: { practiceIds: string[], status: 'approved' | 'excluded' | 'proposed' }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const body = (await request.json()) as { practiceIds?: unknown; status?: unknown };
    const status = body.status;
    if (status !== 'approved' && status !== 'excluded' && status !== 'proposed') {
      return NextResponse.json({ error: 'Status must be approved, excluded, or proposed' }, { status: 400 });
    }
    const wanted = new Set(Array.isArray(body.practiceIds) ? body.practiceIds.filter((id): id is string => typeof id === 'string') : []);
    if (wanted.size === 0) return NextResponse.json({ error: 'Choose at least one practice' }, { status: 400 });

    const { prospects } = await prospectsFor(tenant.organizationId);
    const ids = prospects.map((row) => row.practiceId).filter((id) => wanted.has(id));
    if (status === 'proposed') {
      await prisma.prospectDecision.deleteMany({ where: { organizationId: tenant.organizationId, practiceId: { in: ids } } });
    } else {
      for (const practiceId of ids) {
        await prisma.prospectDecision.upsert({
          where: { organizationId_practiceId: { organizationId: tenant.organizationId, practiceId } },
          create: { organizationId: tenant.organizationId, practiceId, status, decidedBy: tenant.actor },
          update: { status, decidedBy: tenant.actor, decidedAt: new Date() },
        });
      }
    }
    return NextResponse.json({ decided: ids.length, ignored: wanted.size - ids.length });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error deciding prospects:', error);
    return NextResponse.json({ error: 'Failed to save the decision' }, { status: 500 });
  }
}
