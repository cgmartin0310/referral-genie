/**
 * The organization the graph migration inserted. It is Paragon: it runs the
 * program and owns the shared county catalog (referral sources, practices,
 * providers, pulls, research) that every subscriber reads. Subscribers' own
 * clinics, lists, campaigns, activity, and settings live under their own
 * organization (see lib/tenant).
 */
export const DEFAULT_ORGANIZATION_ID = 'org_default';

/** The shared catalog's owner. Same organization, named for what it holds. */
export const CATALOG_ORGANIZATION_ID = DEFAULT_ORGANIZATION_ID;

export function isDefaultOrg(organizationId: string | null | undefined): boolean {
  return organizationId === DEFAULT_ORGANIZATION_ID;
}

/**
 * Practice filter for the shared catalog: pulled practices only. A practice
 * someone added by hand (key own:…) belongs to that organization alone, even
 * Paragon's, which sit in the catalog organization.
 */
export const SHARED_PRACTICE = { organizationId: CATALOG_ORGANIZATION_ID, practiceKey: { not: { startsWith: 'own:' } } };
