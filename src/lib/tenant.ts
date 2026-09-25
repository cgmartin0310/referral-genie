import { auth, clerkClient } from '@clerk/nextjs/server';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import prisma from './prisma';
import { authOptions } from './auth';
import { clerkEnabled } from './clerk-config';
import { DEFAULT_ORGANIZATION_ID } from './org';
import { isParagonOrgName, roleFor, slugFor, type TenantRole } from './tenant-rules';

/**
 * The organization a request acts for, and the person's role in it.
 *
 * A Clerk session in an organization maps to that organization's subscriber
 * (created on first sign-in). The Clerk organization named "Paragon" links
 * to the original organization, which holds everything built so far. The
 * username admin login acts as Paragon.
 */
export interface Tenant {
  organizationId: string;
  organizationName: string;
  role: TenantRole;
  isParagon: boolean;
  via: 'clerk' | 'admin-login';
  /** Who is signed in, for decision logs: a Clerk user id or the admin username. */
  actor: string;
}

export class TenantError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

/** The subscriber row for a Clerk organization, created the first time it is seen. */
export async function organizationForClerk(clerkOrgId: string): Promise<{ id: string; name: string; kind: string }> {
  const linked = await prisma.organization.findUnique({ where: { clerkOrgId }, select: { id: true, name: true, kind: true } });
  if (linked) return linked;

  const client = await clerkClient();
  const clerkOrg = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  if (isParagonOrgName(clerkOrg.name)) {
    const paragon = await prisma.organization.findUnique({ where: { id: DEFAULT_ORGANIZATION_ID }, select: { clerkOrgId: true } });
    if (paragon && !paragon.clerkOrgId) {
      return prisma.organization.update({
        where: { id: DEFAULT_ORGANIZATION_ID },
        data: { clerkOrgId, kind: 'paragon', name: 'Paragon' },
        select: { id: true, name: true, kind: true },
      });
    }
  }

  const slugs = new Set((await prisma.organization.findMany({ select: { slug: true } })).map((row) => row.slug));
  return prisma.organization.create({
    data: { name: clerkOrg.name, slug: slugFor(clerkOrg.name, (slug) => slugs.has(slug)), clerkOrgId, kind: 'subscriber' },
    select: { id: true, name: true, kind: true },
  });
}

export async function currentTenant(): Promise<Tenant> {
  if (clerkEnabled()) {
    const { userId, orgId, orgRole } = await auth();
    if (userId) {
      if (!orgId) throw new TenantError(403, 'Choose an organization to continue.');
      const organization = await organizationForClerk(orgId);
      const kind = organization.kind === 'paragon' ? 'paragon' : 'subscriber';
      return {
        organizationId: organization.id,
        organizationName: organization.name,
        role: roleFor(kind, orgRole),
        isParagon: kind === 'paragon',
        via: 'clerk',
        actor: userId,
      };
    }
  }

  const session = await getServerSession(authOptions);
  if (session?.user) {
    // Local testing only: a session token minted with the dev secret may act as a subscriber.
    const devOrg = process.env.NODE_ENV !== 'production'
      ? (session.user as { tenantOrganizationId?: string }).tenantOrganizationId
      : undefined;
    if (devOrg) {
      const organization = await prisma.organization.findUnique({ where: { id: devOrg }, select: { id: true, name: true, kind: true } });
      if (organization) {
        const kind = organization.kind === 'paragon' ? 'paragon' : 'subscriber';
        return { organizationId: organization.id, organizationName: organization.name, role: roleFor(kind, 'org:admin'), isParagon: kind === 'paragon', via: 'admin-login', actor: session.user.name ?? 'admin' };
      }
    }
    return {
      organizationId: DEFAULT_ORGANIZATION_ID,
      organizationName: 'Paragon',
      role: 'paragon_admin',
      isParagon: true,
      via: 'admin-login',
      actor: session.user.name ?? 'admin',
    };
  }
  throw new TenantError(401, 'Sign in required');
}

/** Only Paragon changes the shared county catalog. */
export function requireParagon(tenant: Tenant, message = 'Only Paragon can change the shared referral source catalog.'): void {
  if (!tenant.isParagon) throw new TenantError(403, message);
}

/** A route's catch: tenant errors become their status; anything else is the route's to handle. */
export function tenantErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof TenantError) return NextResponse.json({ error: error.message }, { status: error.status });
  return null;
}
