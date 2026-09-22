-- A practice on a clinic's referral list. The association a user makes after
-- sources are pulled and enriched. Relationship data lives here, not on the
-- shared practice row.
CREATE TABLE "ClinicPractice" (
    "id" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "expectedMonthlyReferrals" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "ClinicPractice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicPractice_clinicLocationId_practiceId_key" ON "ClinicPractice"("clinicLocationId", "practiceId");

CREATE INDEX "ClinicPractice_practiceId_idx" ON "ClinicPractice"("practiceId");

CREATE INDEX "ClinicPractice_organizationId_idx" ON "ClinicPractice"("organizationId");

ALTER TABLE "ClinicPractice" ADD CONSTRAINT "ClinicPractice_clinicLocationId_fkey" FOREIGN KEY ("clinicLocationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicPractice" ADD CONSTRAINT "ClinicPractice_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicPractice" ADD CONSTRAINT "ClinicPractice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
