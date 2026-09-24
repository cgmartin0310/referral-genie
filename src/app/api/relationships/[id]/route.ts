import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { cleanAnswers, trustScore } from '@/lib/relationships/trs';

export const dynamic = 'force-dynamic';

/** Update the relationship answers (the score follows) or the clinic it belongs to. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const existing = await prisma.sourceRelationship.findFirst({ where: { id, organizationId: tenant.organizationId } });
    if (!existing) return NextResponse.json({ error: 'Referral source not found' }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    const merged = cleanAnswers({
      lastReferral: 'lastReferral' in body ? body.lastReferral : existing.lastReferral,
      referralVolume: 'referralVolume' in body ? body.referralVolume : existing.referralVolume,
      strength: 'strength' in body ? body.strength : existing.strength,
      origin: 'origin' in body ? body.origin : existing.origin,
    });
    let clinicLocationId = existing.clinicLocationId;
    if ('clinicLocationId' in body) {
      const wanted = typeof body.clinicLocationId === 'string' && body.clinicLocationId ? body.clinicLocationId : null;
      if (wanted) {
        const clinic = await prisma.clinicLocation.findFirst({ where: { id: wanted, organizationId: tenant.organizationId }, select: { id: true } });
        if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }
      clinicLocationId = wanted;
    }
    const updated = await prisma.sourceRelationship.update({
      where: { id },
      data: { ...merged, trs: trustScore(merged), clinicLocationId },
    });
    return NextResponse.json({ id: updated.id, trs: updated.trs });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error updating a relationship:', error);
    return NextResponse.json({ error: 'Failed to update the referral source' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const result = await prisma.sourceRelationship.deleteMany({ where: { id, organizationId: tenant.organizationId } });
    if (result.count === 0) return NextResponse.json({ error: 'Referral source not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error removing a relationship:', error);
    return NextResponse.json({ error: 'Failed to remove the referral source' }, { status: 500 });
  }
}
