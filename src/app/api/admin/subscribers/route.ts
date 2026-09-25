import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { clerkEnabled } from '@/lib/clerk-config';
import { currentTenant, organizationForClerk, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { addSubscriber } from '@/lib/subscribers';
import { inviteRedirectUrl, subscriberInput } from '@/lib/subscriber-rules';

export const dynamic = 'force-dynamic';

interface Row {
  id: string | null;
  name: string;
  kind: string;
  clerkOrgId: string | null;
  members: number | null;
  signedIn: boolean;
  clinics: number;
  listed: number;
  campaigns: number;
  activity: number;
  createdAt: string | null;
}

/**
 * Every subscriber, for Paragon: its Clerk organization and members, and how
 * much it has set up. A Clerk organization made outside Referral360 (in the
 * Clerk dashboard) is set up here as it would be on its first sign-in, so it
 * can be invited to and moved to right away.
 */
export async function GET() {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The subscriber list is for Paragon.');
    const clerkError = clerkEnabled() ? await linkClerkOrganizations() : null;

    const organizations = await prisma.organization.findMany({
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        kind: true,
        clerkOrgId: true,
        createdAt: true,
        _count: { select: { clinicLocations: true, clinicPractices: true, campaigns: true, interactions: true } },
      },
    });

    const members = new Map<string, number>();
    if (clerkEnabled() && !clerkError) {
      try {
        const client = await clerkClient();
        const list = await client.organizations.getOrganizationList({ limit: 200, includeMembersCount: true });
        for (const org of list.data) members.set(org.id, org.membersCount ?? 0);
      } catch {
        // Member counts are a nicety; the list still shows without them.
      }
    }

    const rows: Row[] = organizations.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      clerkOrgId: row.clerkOrgId,
      members: row.clerkOrgId ? members.get(row.clerkOrgId) ?? null : null,
      signedIn: Boolean(row.clerkOrgId) || row.kind === 'paragon',
      clinics: row._count.clinicLocations,
      listed: row._count.clinicPractices,
      campaigns: row._count.campaigns,
      activity: row._count.interactions,
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({ subscribers: rows, clerk: clerkEnabled(), clerkError });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error listing subscribers:', error);
    return NextResponse.json({ error: 'Failed to list subscribers' }, { status: 500 });
  }
}

/** Give every Clerk organization its row here. Returns Clerk's error, if it could not be reached. */
async function linkClerkOrganizations(): Promise<string | null> {
  try {
    const client = await clerkClient();
    const list = await client.organizations.getOrganizationList({ limit: 200 });
    const linked = new Set(
      (await prisma.organization.findMany({ where: { clerkOrgId: { not: null } }, select: { clerkOrgId: true } })).map((row) => row.clerkOrgId),
    );
    for (const org of list.data) {
      if (!linked.has(org.id)) await organizationForClerk(org.id);
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not reach Clerk';
  }
}

/**
 * Add a subscriber: creates its Clerk organization and emails the owner an
 * invitation to be its admin. Body: { name, ownerEmail }.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'Only Paragon adds subscribers.');
    if (!clerkEnabled()) {
      return NextResponse.json({ error: 'Clerk is not set up on this server, so subscribers cannot sign in yet.' }, { status: 400 });
    }
    const names = (await prisma.organization.findMany({ select: { name: true } })).map((row) => row.name);
    const input = subscriberInput(await request.json().catch(() => ({})), names);
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const { organization, inviteError } = await addSubscriber({ ...input, redirectUrl: inviteRedirectUrl(request.headers) });
    return NextResponse.json({ subscriber: organization, invited: inviteError ? null : input.ownerEmail, inviteError });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error adding subscriber:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to add the subscriber' }, { status: 500 });
  }
}
