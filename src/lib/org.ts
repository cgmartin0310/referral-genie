/** Single design-partner organization inserted by the graph migration. */
export const DEFAULT_ORGANIZATION_ID = 'org_default';

export function isDefaultOrg(organizationId: string | null | undefined): boolean {
  return organizationId === DEFAULT_ORGANIZATION_ID;
}
