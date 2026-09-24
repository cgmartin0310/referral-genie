import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { nextStage } from '@/lib/universe';

export const dynamic = 'force-dynamic';

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) || null : undefined);

/** Move a practice along the ladder, or record its referral coordinator or assignee. Body: { stage?, rcName?, rcPhone?, rcEmail?, assignee? } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The Source Universe is for Paragon.');
    const { id } = await params;
    const existing = await prisma.practice.findFirst({
      where: { id, organizationId: CATALOG_ORGANIZATION_ID },
      select: { id: true, outreachStage: true },
    });
    if (!existing) return NextResponse.json({ error: 'Practice not found' }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    const stage = nextStage(existing.outreachStage, body);
    const fields = {
      rcName: text(body.rcName, 120),
      rcPhone: text(body.rcPhone, 40),
      rcEmail: text(body.rcEmail, 160),
      assignee: text(body.assignee, 80),
    };
    const updated = await prisma.practice.update({
      where: { id },
      data: {
        ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
        outreachStage: stage,
        ...(stage !== existing.outreachStage ? { stageChangedAt: new Date() } : {}),
      },
      select: { id: true, outreachStage: true, rcName: true, rcPhone: true, rcEmail: true, assignee: true, stageChangedAt: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error updating the Source Universe:', error);
    return NextResponse.json({ error: 'Failed to update the practice' }, { status: 500 });
  }
}
