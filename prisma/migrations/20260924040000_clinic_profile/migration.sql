-- A clinic's disciplines, patients, payers, and place; a practice's place.
ALTER TABLE "ClinicLocation" ADD COLUMN "disciplines" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ClinicLocation" ADD COLUMN "pediatric" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ClinicLocation" ADD COLUMN "payersAccepted" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ClinicLocation" ADD COLUMN "acceptingNewPatients" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ClinicLocation" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "ClinicLocation" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Practice" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Practice" ADD COLUMN "longitude" DOUBLE PRECISION;
