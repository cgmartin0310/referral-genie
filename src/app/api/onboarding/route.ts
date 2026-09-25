import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { loadFaxSettings } from '@/lib/fax/settings';
import { optOutLine } from '@/lib/fax/opt-out';
import { prospectsFor } from '@/lib/prospects/db';

export const dynamic = 'force-dynamic';

const PROFILE_FIELDS = ['ownerName', 'ownerPhone', 'ownerEmail', 'contactName', 'contactPhone', 'contactEmail'] as const;

async function progress(organizationId: string) {
  const [organization, clinics, sources, fax, prospects] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, ownerName: true, ownerPhone: true, ownerEmail: true, contactName: true, contactPhone: true, contactEmail: true, onboardedAt: true },
    }),
    prisma.clinicLocation.count({ where: { organizationId } }),
    prisma.clinicPractice.count({ where: { organizationId } }),
    loadFaxSettings(organizationId),
    prospectsFor(organizationId),
  ]);
  const steps = {
    contacts: Boolean(organization.ownerName && (organization.ownerEmail || organization.ownerPhone)),
    clinics: clinics > 0,
    sources: sources > 0,
    fax: optOutLine(fax) !== null,
  };
  return {
    organizationName: organization.name,
    profile: Object.fromEntries(PROFILE_FIELDS.map((field) => [field, organization[field] ?? ''])),
    steps,
    counts: {
      clinics,
      sources,
      prospects: prospects.prospects.filter((row) => row.status !== 'excluded').length,
      prospectProviders: prospects.prospects.filter((row) => row.status !== 'excluded').reduce((sum, row) => sum + row.providers, 0),
    },
    done: Object.values(steps).filter(Boolean).length,
    total: Object.keys(steps).length,
    onboardedAt: organization.onboardedAt?.toISOString() ?? null,
  };
}

/** Where the signed-in subscriber is in setting up Referral360. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    return NextResponse.json({ ...(await progress(tenant.organizationId)), isParagon: tenant.isParagon });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading onboarding:', error);
    return NextResponse.json({ error: 'Failed to load setup' }, { status: 500 });
  }
}

/** Save the contacts, or mark setup finished. Body: { profile?: {...}, finish?: true } */
export async function PUT(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const body = (await request.json()) as { profile?: Record<string, unknown>; finish?: unknown };
    const data: Record<string, unknown> = {};
    for (const field of PROFILE_FIELDS) {
      const value = body.profile?.[field];
      if (typeof value === 'string') data[field] = value.trim().slice(0, 160) || null;
    }
    if (body.finish === true) data.onboardedAt = new Date();
    if (Object.keys(data).length > 0) {
      await prisma.organization.update({ where: { id: tenant.organizationId }, data });
    }
    return NextResponse.json({ ...(await progress(tenant.organizationId)), isParagon: tenant.isParagon });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error saving onboarding:', error);
    return NextResponse.json({ error: 'Failed to save setup' }, { status: 500 });
  }
}
