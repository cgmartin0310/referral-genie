-- Forward recovery for databases that already finished
-- 20260921120000_graph_fields_org_county_ingest.
--
-- That migration can succeed when an organization has at most one blank
-- npiNumber, and the unique index then rejects the next blank insert.
-- Production failed earlier (P3018 / 23505) and PostgreSQL rolled that
-- migration's transaction back; the corrected copy of that migration nulls
-- blanks before creating the index. This migration is a no-op in that case
-- and still cleans databases that kept a stored ''.
--
-- Multiple NULL NPIs are allowed. A non-blank NPI stays unique per organization.

UPDATE "ReferralSource"
SET "npiNumber" = NULL
WHERE "npiNumber" IS NOT NULL
  AND "npiNumber" ~ '^[[:space:]]*$';

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralSource_organizationId_npiNumber_key"
  ON "ReferralSource"("organizationId", "npiNumber");
