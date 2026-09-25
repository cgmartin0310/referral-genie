-- NPI's mailing-address fax: a fallback for practices that list no fax at their location.
ALTER TABLE "NpiRecord" ADD COLUMN "mailingCity" TEXT;
ALTER TABLE "NpiRecord" ADD COLUMN "mailingState" TEXT;
ALTER TABLE "NpiRecord" ADD COLUMN "mailingFax" TEXT;
ALTER TABLE "ReferralSource" ADD COLUMN "mailingFax" TEXT;
