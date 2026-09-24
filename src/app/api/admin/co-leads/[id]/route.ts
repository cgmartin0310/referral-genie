import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { CO_STAGES } from '@/lib/acquisition/leads';

export const dynamic = 'force-dynamic';

/** Move a lead along, or note who owns it and what happened. Body: { stage?, notes?, assignee? } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'Clinic-owner leads are for Paragon.');
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (CO_STAGES.some((row) => row.key === body.stage)) data.stage = body.stage;
    if (typeof body.notes === 'string') data.notes = body.notes.trim().slice(0, 2000) || null;
    if (typeof body.assignee === 'string') data.assignee = body.assignee.trim().slice(0, 80) || null;
    const updated = await prisma.coLead.update({ where: { id }, data }).catch(() => null);
    if (!updated) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error updating a clinic-owner lead:', error);
    return NextResponse.json({ error: 'Failed to update the lead' }, { status: 500 });
  }
}
