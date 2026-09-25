-- Scores move from each clinic's list entry to one per company and practice.
-- Where a company scored one practice differently at two clinics, the most
-- recent score wins.
CREATE TABLE "PracticeScore" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setBy" TEXT,

    CONSTRAINT "PracticeScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PracticeScore_organizationId_practiceId_key" ON "PracticeScore"("organizationId", "practiceId");
CREATE INDEX "PracticeScore_practiceId_idx" ON "PracticeScore"("practiceId");
ALTER TABLE "PracticeScore" ADD CONSTRAINT "PracticeScore_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticeScore" ADD CONSTRAINT "PracticeScore_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PracticeScore" ("id", "organizationId", "practiceId", "tier", "setAt", "setBy")
SELECT DISTINCT ON (cp."organizationId", cp."practiceId")
  'ps_' || md5(cp."organizationId" || '|' || cp."practiceId"), cp."organizationId", cp."practiceId", cp."tier",
  COALESCE(cp."tierSetAt", cp."updatedAt"), cp."tierSetBy"
FROM "ClinicPractice" cp
WHERE cp."tier" IS NOT NULL
ORDER BY cp."organizationId", cp."practiceId", cp."tierSetAt" DESC NULLS LAST;

-- A clinic can still take one practice off its own list; a later pull keeps it off.
ALTER TABLE "ClinicPractice" ADD COLUMN "excludedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "ClinicPractice_clinicLocationId_tier_idx";
ALTER TABLE "ClinicPractice" DROP COLUMN "tier";
ALTER TABLE "ClinicPractice" DROP COLUMN "tierSetAt";
ALTER TABLE "ClinicPractice" DROP COLUMN "tierSetBy";
