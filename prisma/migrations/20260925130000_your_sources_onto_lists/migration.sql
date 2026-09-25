-- Your Sources becomes the clinic referral lists. Each existing source goes
-- onto its clinic's list (every clinic of its organization when it named
-- none), scored from its trust score: 70+ Trusted, 40+ Warm, else Cold.
-- A source the catalog lacks becomes the organization's own practice.
-- The SourceRelationship rows are kept, untouched.

INSERT INTO "Practice" ("id", "practiceKey", "name", "address", "city", "state", "zipCode", "phone", "faxNumber", "formedBy", "organizationId", "createdAt", "updatedAt")
SELECT 'own_' || sr."id", 'own:rel:' || sr."id", COALESCE(NULLIF(sr."practiceName", ''), sr."name"), sr."address", sr."city", sr."state", sr."zip", sr."phone", sr."fax", 'manual', sr."organizationId", NOW(), NOW()
FROM "SourceRelationship" sr
WHERE sr."practiceId" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "Practice" p WHERE p."id" = sr."practiceId")
ON CONFLICT DO NOTHING;

WITH entries AS (
  SELECT DISTINCT ON (c."id", pr."id")
    c."id" AS clinic_id,
    pr."id" AS practice_id,
    sr."organizationId" AS organization_id,
    CASE WHEN sr."trs" >= 70 THEN 'trusted' WHEN sr."trs" >= 40 THEN 'warm' ELSE 'cold' END AS tier,
    sr."updatedAt" AS scored_at,
    CASE WHEN sr."createdFrom" = 'upload' THEN 'import' ELSE 'manual' END AS added_from
  FROM "SourceRelationship" sr
  JOIN "ClinicLocation" c
    ON c."organizationId" = sr."organizationId"
   AND (c."id" = sr."clinicLocationId" OR sr."clinicLocationId" IS NULL)
  JOIN "Practice" pr
    ON pr."id" = CASE
      WHEN sr."practiceId" IS NOT NULL AND EXISTS (SELECT 1 FROM "Practice" p WHERE p."id" = sr."practiceId") THEN sr."practiceId"
      ELSE 'own_' || sr."id"
    END
  ORDER BY c."id", pr."id", sr."trs" DESC
)
INSERT INTO "ClinicPractice" ("id", "clinicLocationId", "practiceId", "organizationId", "tier", "tierSetAt", "addedFrom", "createdAt", "updatedAt")
SELECT 'rel_' || md5(clinic_id || '|' || practice_id), clinic_id, practice_id, organization_id, tier, scored_at, added_from, NOW(), NOW()
FROM entries
ON CONFLICT ("clinicLocationId", "practiceId") DO UPDATE
  SET "tier" = COALESCE("ClinicPractice"."tier", EXCLUDED."tier"),
      "tierSetAt" = COALESCE("ClinicPractice"."tierSetAt", EXCLUDED."tierSetAt");
