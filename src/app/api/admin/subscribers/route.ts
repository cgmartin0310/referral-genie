import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { clerkEnabled } from '@/lib/clerk-config';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';

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
 * much it has set up. A Clerk organization nobody has signed into yet is
 * listed too, as not signed in.
 */
export async function GET() {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The subscriber list is for Paragon.');

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
    const clerkOnly: Row[] = [];
    let clerkError: string | null = null;
    if (clerkEnabled()) {
      try {
        const client = await clerkClient();
        const list = await client.organizations.getOrganizationList({ limit: 200, includeMembersCount: true });
        const linked = new Set(organizations.map((row) => row.clerkOrgId).filter(Boolean));
        for (const org of list.data) {
          members.set(org.id, org.membersCount ?? 0);
          if (!linked.has(org.id)) {
            clerkOnly.push({
              id: null, name: org.name, kind: 'subscriber', clerkOrgId: org.id, members: org.membersCount ?? 0,
              signedIn: false, clinics: 0, listed: 0, campaigns: 0, activity: 0, createdAt: new Date(org.createdAt).toISOString(),
            });
          }
        }
      } catch (error) {
        clerkError = error instanceof Error ? error.message : 'Could not reach Clerk';
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

    return NextResponse.json({ subscribers: [...rows, ...clerkOnly], clerk: clerkEnabled(), clerkError });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error listing subscribers:', error);
    return NextResponse.json({ error: 'Failed to list subscribers' }, { status: 500 });
  }
}
