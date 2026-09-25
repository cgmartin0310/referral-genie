-- A company with permission from every practice it faxes can leave the opt-out line off; who said so, and when, is kept.
ALTER TABLE "FaxSettings" ADD COLUMN "suppressOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FaxSettings" ADD COLUMN "consentAttestedAt" TIMESTAMP(3);
ALTER TABLE "FaxSettings" ADD COLUMN "consentAttestedBy" TEXT;
