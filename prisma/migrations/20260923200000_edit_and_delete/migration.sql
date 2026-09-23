-- Editing and deleting referral sources. A person's changes survive later pulls.
ALTER TABLE "Practice" ADD COLUMN "formedBy" TEXT;
ALTER TABLE "Practice" ADD COLUMN "editedFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Practice" ADD COLUMN "hiddenAt" TIMESTAMP(3);
ALTER TABLE "Provider" ADD COLUMN "hiddenAt" TIMESTAMP(3);
