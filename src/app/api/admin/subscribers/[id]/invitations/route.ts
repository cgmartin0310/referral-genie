import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { inviteMember } from '@/lib/subscribers';
import { cleanEmail, inviteRedirectUrl } from '@/lib/subscriber-rules';

/**
 * Invite someone to a subscriber, for Paragon. Body: { email, role: 'admin' | 'member' }.
 * An owner invites their own staff from the organization menu instead.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'Only Paragon invites people to a subscriber.');
    const { id } = await params;
    const organization = await prisma.organization.findUnique({ where: { id }, select: { id: true, kind: true } });
    if (!organization || organization.kind === 'paragon') {
      return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    if (!email) return NextResponse.json({ error: 'Enter an email address.' }, { status: 400 });
    const role = body.role === 'member' ? 'org:member' : 'org:admin';
    await inviteMember({ organizationId: organization.id, email, role, redirectUrl: inviteRedirectUrl(request.headers) });
    return NextResponse.json({ invited: email });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error inviting to subscriber:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The invitation was not sent' }, { status: 400 });
  }
}
