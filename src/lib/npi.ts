/**
 * Blank NPIs are not identifiers. Persist them as null so several manual
 * sources in one organization do not collide on (organizationId, npiNumber).
 * Postgres unique indexes treat '' as a value and treat NULL as distinct.
 */
export function normalizeNpiNumber(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
