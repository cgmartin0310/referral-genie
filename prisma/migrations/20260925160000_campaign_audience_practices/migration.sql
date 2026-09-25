-- A campaign can go to chosen practices on its clinic's list (a test fax, a handful).
ALTER TABLE "Campaign" ADD COLUMN "audiencePracticeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
