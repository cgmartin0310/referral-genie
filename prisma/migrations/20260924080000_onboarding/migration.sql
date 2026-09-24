-- Onboarding: a subscriber's owner and day-to-day contact, and when setup finished.
ALTER TABLE "Organization" ADD COLUMN "ownerName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "ownerPhone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "ownerEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "onboardedAt" TIMESTAMP(3);
