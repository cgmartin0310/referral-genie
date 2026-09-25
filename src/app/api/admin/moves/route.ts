import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { executeMove, MoveError, planMove, summarize } from '@/lib/admin/move';

export const dynamic = 'force-dynamic';

function ids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];
}

/** What can be moved out of this organization, and where to. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'Moving clinics between organizations is for Paragon.');
    const [organizations, clinics, campaigns] = await Promise.all([
      prisma.organization.findMany({
        where: { id: { not: tenant.organizationId } },
        select: { id: true, name: true, kind: true },
        orderBy: { name: 'asc' },
      }),
      prisma.clinicLocation.findMany({
        where: { organizationId: tenant.organizationId },
        select: { id: true, name: true, city: true, state: true, _count: { select: { clinicPractices: true, campaigns: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.campaign.findMany({
        where: { organizationId: tenant.organizationId, audienceClinicId: null },
        select: { id: true, name: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return NextResponse.json({
      from: { id: tenant.organizationId, name: tenant.organizationName },
      organizations,
      clinics: clinics.map((clinic) => ({
        id: clinic.id,
        name: clinic.name,
        place: [clinic.city, clinic.state].filter(Boolean).join(', '),
        listed: clinic._count.clinicPractices,
        campaigns: clinic._count.campaigns,
      })),
      campaignsWithoutClinic: campaigns,
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading moves:', error);
    return NextResponse.json({ error: 'Failed to load clinics to move' }, { status: 500 });
  }
}

/**
 * Body: { toOrganizationId, clinicIds, campaignIds, confirm }. Without
 * confirm it only says what would move.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'Moving clinics between organizations is for Paragon.');
    const body = await request.json().catch(() => ({}));
    const clinicIds = ids(body.clinicIds);
    const campaignIds = ids(body.campaignIds);
    if (typeof body.toOrganizationId !== 'string' || !body.toOrganizationId) {
      return NextResponse.json({ error: 'Choose the organization to move to.' }, { status: 400 });
    }
    if (clinicIds.length === 0 && campaignIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one clinic or campaign.' }, { status: 400 });
    }
    const plan = await planMove({ fromOrganizationId: tenant.organizationId, toOrganizationId: body.toOrganizationId, clinicIds, campaignIds });
    if (body.confirm === true) {
      await executeMove(plan, tenant.organizationId, body.toOrganizationId);
      console.log(`Moved to ${body.toOrganizationId} by ${tenant.actor}:`, JSON.stringify(summarize(plan)));
    }
    return NextResponse.json({ moved: body.confirm === true, summary: summarize(plan), clinics: plan.clinics, campaigns: plan.campaigns });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    if (error instanceof MoveError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Error moving clinics:', error);
    return NextResponse.json({ error: 'The move failed; nothing was moved.' }, { status: 500 });
  }
}
