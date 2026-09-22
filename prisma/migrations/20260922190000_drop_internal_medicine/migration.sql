-- Internal medicine is no longer a referral source type: adult internists
-- rarely refer to pediatric therapy. Remove rows already pulled, keeping any
-- source a person has logged activity or a campaign against, then recompute
-- practice provider counts so the catalog is honest before the next pull.

DELETE FROM "Provider" WHERE "sourceType" = 'pcp_internal_medicine';

DELETE FROM "ReferralSource" r
WHERE r."sourceType" = 'pcp_internal_medicine'
  AND NOT EXISTS (SELECT 1 FROM "Interaction" i WHERE i."referralSourceId" = r.id)
  AND NOT EXISTS (SELECT 1 FROM "CampaignToReferralSource" c WHERE c."referralSourceId" = r.id);

UPDATE "ReferralSource" SET "categoryId" = NULL WHERE "categoryId" = 'cat_pcp_internal_medicine';
DELETE FROM "ReferralCategory" WHERE "id" = 'cat_pcp_internal_medicine';

-- Recount providers per practice from what remains.
UPDATE "Practice" p
SET "providerCount" = sub.cnt, "taxonomyMix" = sub.mix
FROM (
  SELECT "practiceId", SUM(n)::int AS cnt, jsonb_object_agg(t, n) AS mix
  FROM (
    SELECT "practiceId", COALESCE("sourceType", 'unknown') AS t, COUNT(*) AS n
    FROM "Provider" WHERE "practiceId" IS NOT NULL
    GROUP BY 1, 2
  ) x
  GROUP BY "practiceId"
) sub
WHERE p.id = sub."practiceId";

UPDATE "Practice" SET "providerCount" = 0, "taxonomyMix" = '{}'::jsonb
WHERE "providerCount" > 0
  AND NOT EXISTS (SELECT 1 FROM "Provider" v WHERE v."practiceId" = "Practice".id);

-- A practice that existed only because of internal medicine providers goes too,
-- unless it has an organization NPI, is on a clinic's list, or was faxed.
DELETE FROM "Practice" p
WHERE p."providerCount" = 0
  AND cardinality(p."orgNpis") = 0
  AND p."countyFips" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "ClinicPractice" cp WHERE cp."practiceId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "CampaignTarget" t WHERE t."practiceId" = p.id);
