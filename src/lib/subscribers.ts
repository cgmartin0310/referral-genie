import { clerkClient } from '@clerk/nextjs/server';
import prisma from './prisma';
import { organizationForClerk } from './tenant';

/**
 * Adding subscribers from Referral360, so no one works in the Clerk dashboard:
 * the Clerk organization is created here and its owner is emailed an invitation.
 */

export type MemberRole = 'org:admin' | 'org:member';

function clerkMessage(error: unknown): string {
  const errors = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  const first = Array.isArray(errors) ? errors[0] : null;
  return first?.longMessage || first?.message || (error instanceof Error ? error.message : 'Clerk refused the request');
}

export async function inviteMember(input: { organizationId: string; email: string; role: MemberRole; redirectUrl?: string }) {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { clerkOrgId: true, name: true },
  });
  if (!organization?.clerkOrgId) throw new Error('This organization has no Clerk account to invite people to.');
  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: organization.clerkOrgId,
      emailAddress: input.email,
      role: input.role,
      redirectUrl: input.redirectUrl,
    });
  } catch (error) {
    throw new Error(clerkMessage(error));
  }
}

/**
 * Create the subscriber: its Clerk organization, its row here, and an
 * invitation making the owner its admin. When the invitation fails the
 * subscriber still exists, and the invitation can be sent again from its row.
 */
export async function addSubscriber(input: { name: string; ownerEmail: string; redirectUrl?: string }) {
  let clerkOrgId: string;
  try {
    const client = await clerkClient();
    clerkOrgId = (await client.organizations.createOrganization({ name: input.name })).id;
  } catch (error) {
    throw new Error(clerkMessage(error));
  }
  const organization = await organizationForClerk(clerkOrgId);
  let inviteError: string | null = null;
  try {
    await inviteMember({ organizationId: organization.id, email: input.ownerEmail, role: 'org:admin', redirectUrl: input.redirectUrl });
  } catch (error) {
    inviteError = error instanceof Error ? error.message : 'The invitation was not sent';
  }
  return { organization, inviteError };
}
