-- A practice that asked to stop receiving faxes, for every subscriber.
ALTER TABLE "Practice" ADD COLUMN "faxOptOutAt" TIMESTAMP(3);
ALTER TABLE "Practice" ADD COLUMN "faxOptOutBy" TEXT;
