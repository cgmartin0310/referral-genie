/**
 * Who a signed-in person is to Referral360, from their Clerk organization.
 * Pure, so the rules are tested without Clerk.
 */

export type TenantRole = 'paragon_admin' | 'owner' | 'staff';

/** The Clerk organization named "Paragon" is the program's own. */
export function isParagonOrgName(name: string | null | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === 'paragon';
}

/**
 * Clerk's built-in admin is a subscriber's owner; anyone else there is staff
 * (intake, clinician). Custom roles named owner, intake, or clinician map the
 * same way once they exist. Every member of Paragon is a Paragon admin.
 */
export function roleFor(orgKind: 'paragon' | 'subscriber', clerkRole: string | null | undefined): TenantRole {
  if (orgKind === 'paragon') return 'paragon_admin';
  const role = (clerkRole ?? '').replace(/^org:/, '');
  return role === 'admin' || role === 'owner' ? 'owner' : 'staff';
}

export function slugFor(name: string, taken: (slug: string) => boolean): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'subscriber';
  let slug = base;
  for (let index = 2; taken(slug); index += 1) slug = `${base}-${index}`;
  return slug;
}
