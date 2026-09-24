-- Paragon's outreach ladder for each catalog practice.
ALTER TABLE "Practice" ADD COLUMN "outreachStage" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "Practice" ADD COLUMN "stageChangedAt" TIMESTAMP(3);
ALTER TABLE "Practice" ADD COLUMN "rcName" TEXT;
ALTER TABLE "Practice" ADD COLUMN "rcPhone" TEXT;
ALTER TABLE "Practice" ADD COLUMN "rcEmail" TEXT;
ALTER TABLE "Practice" ADD COLUMN "assignee" TEXT;
