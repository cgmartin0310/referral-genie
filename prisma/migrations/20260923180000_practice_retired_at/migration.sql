-- A row a pull no longer forms, kept only because a clinic list or campaign points at it.
ALTER TABLE "Practice" ADD COLUMN "retiredAt" TIMESTAMP(3);
