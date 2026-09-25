import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { parseTier } from '@/lib/referral-list/tiers';

const FIELDS = ['name', 'address', 'city', 'state', 'zipCode', 'phone', 'faxNumber', 'website'] as const;

/**
 * Add a practice the catalog does not have, by hand, straight onto the
 * clinic's list. It belongs to this subscriber alone: no one else sees it,
 * and the shared catalog never takes it in.
 * Body: name (required), address, city, state, zipCode, phone, faxNumber,
 * website, tier.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinic = await prisma.clinicLocation.findFirst({ where: { id, organizationId: tenant.organizationId }, select: { id: true } });
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const values: Record<string, string | null> = {};
    for (const field of FIELDS) {
      const raw = typeof body[field] === 'string' ? (body[field] as string).trim().slice(0, 200) : '';
      values[field] = raw ? (field === 'state' ? raw.toUpperCase() : raw) : null;
    }
    if (!values.name) return NextResponse.json({ error: 'Enter the practice name.' }, { status: 400 });
    const tier = parseTier(body.tier);

    const practice = await prisma.$transaction(async (tx) => {
      const created = await tx.practice.create({
        data: {
          organizationId: tenant.organizationId,
          practiceKey: `own:${randomUUID()}`,
          formedBy: 'manual',
          name: values.name!,
          address: values.address,
          city: values.city,
          state: values.state,
          zipCode: values.zipCode,
          phone: values.phone,
          faxNumber: values.faxNumber,
          website: values.website,
        },
        select: { id: true, name: true },
      });
      await tx.clinicPractice.create({
        data: {
          organizationId: tenant.organizationId,
          clinicLocationId: id,
          practiceId: created.id,
          addedFrom: 'manual',
          ...(tier ? { tier, tierSetAt: new Date(), tierSetBy: tenant.actor } : {}),
        },
      });
      return created;
    });
    return NextResponse.json({ practice }, { status: 201 });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error adding a practice by hand:', error);
    return NextResponse.json({ error: 'Failed to add the practice' }, { status: 500 });
  }
}
