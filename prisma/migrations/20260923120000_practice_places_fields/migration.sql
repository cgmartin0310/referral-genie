-- Google Places enrichment, carried up to the row a person sees.
ALTER TABLE "Practice" ADD COLUMN "website" TEXT;
ALTER TABLE "Practice" ADD COLUMN "rating" DOUBLE PRECISION;
ALTER TABLE "Practice" ADD COLUMN "reviewCount" INTEGER;
