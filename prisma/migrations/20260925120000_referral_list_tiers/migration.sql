-- Each referral-list entry carries the subscriber's tier, which sets its outreach.
ALTER TABLE "ClinicPractice" ADD COLUMN "tier" TEXT;
ALTER TABLE "ClinicPractice" ADD COLUMN "tierSetAt" TIMESTAMP(3);
ALTER TABLE "ClinicPractice" ADD COLUMN "tierSetBy" TEXT;
ALTER TABLE "ClinicPractice" ADD COLUMN "addedFrom" TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX "ClinicPractice_clinicLocationId_tier_idx" ON "ClinicPractice"("clinicLocationId", "tier");
