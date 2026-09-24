import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { practiceIncludeFor, presentPractice } from '@/lib/practices/present';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { loadEstimateRates } from '@/lib/practices/estimate-settings';

export const dynamic = 'force-dynamic';

/** Fields a person can change on a referral source. The pull leaves them as set. */
const EDITABLE = ['name', 'address', 'city', 'state', 'zipCode', 'phone', 'faxNumber', 'website'] as const;
type Editable = (typeof EDITABLE)[number];

function clean(field: Editable, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return field === 'state' ? trimmed.toUpperCase() : trimmed;
}

async function load(id: string) {
  return prisma.practice.findFirst({ where: { id, organizationId: CATALOG_ORGANIZATION_ID } });
}

/**
 * Edit a referral source, or delete and restore it.
 * Body: any of name, address, city, state, zipCode, phone, faxNumber, website
 * (strings), and hidden (boolean: true deletes, false restores).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // The shared catalog is Paragon's to edit and delete.
    const tenant = await currentTenant();
    requireParagon(tenant);
    const { id } = await params;
    const existing = await load(id);
    if (!existing) return NextResponse.json({ error: 'Referral source not found' }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    const edited = new Set(existing.editedFields);
    for (const field of EDITABLE) {
      const value = body[field];
      if (typeof value !== 'string') continue;
      const next = clean(field, value);
      if (field === 'name' && !next) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }
      if (next === (existing[field] ?? null)) continue;
      data[field] = next;
      edited.add(field);
    }
    if (typeof body.hidden === 'boolean') data.hiddenAt = body.hidden ? new Date() : null;
    if (Object.keys(data).length === 0) {
      const unchanged = await prisma.practice.findUniqueOrThrow({ where: { id }, include: practiceIncludeFor(tenant.organizationId) });
      return NextResponse.json(presentPractice(unchanged, await loadEstimateRates(tenant.organizationId)));
    }
    data.editedFields = [...edited];

    const updated = await prisma.practice.update({ where: { id }, data, include: practiceIncludeFor(tenant.organizationId) });
    return NextResponse.json(presentPractice(updated, await loadEstimateRates(tenant.organizationId)));
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error updating referral source:', error);
    return NextResponse.json({ error: 'Failed to update the referral source' }, { status: 500 });
  }
}

/** Delete: hidden from the list and kept deleted by later pulls. Restore with PATCH { hidden: false }. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // The shared catalog is Paragon's to edit and delete.
    const tenant = await currentTenant();
    requireParagon(tenant);
    const { id } = await params;
    const existing = await load(id);
    if (!existing) return NextResponse.json({ error: 'Referral source not found' }, { status: 404 });
    await prisma.practice.update({ where: { id }, data: { hiddenAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error deleting referral source:', error);
    return NextResponse.json({ error: 'Failed to delete the referral source' }, { status: 500 });
  }
}
