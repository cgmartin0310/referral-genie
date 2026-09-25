-- A campaign can fax only some tiers of its clinic's list.
ALTER TABLE "Campaign" ADD COLUMN "audienceTiers" TEXT[] DEFAULT ARRAY[]::TEXT[];
