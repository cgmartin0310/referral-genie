-- CreateTable
CREATE TABLE "ClinicLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "phoneNumber" TEXT,
    "faxNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicLocation_name_key" ON "ClinicLocation"("name");

-- Insert default clinic locations
INSERT INTO "ClinicLocation" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES 
    ('clm1', 'Jacksonville', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clm2', 'Wilmington', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clm3', 'Beulaville', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clm4', 'Goldsboro', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clm5', 'Nashville', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable - Add new column
ALTER TABLE "ReferralSource" ADD COLUMN "clinicLocationId" TEXT;

-- Migrate existing data
UPDATE "ReferralSource" 
SET "clinicLocationId" = CASE "clinicLocation"
    WHEN 'Jacksonville' THEN 'clm1'
    WHEN 'Wilmington' THEN 'clm2'
    WHEN 'Beulaville' THEN 'clm3'
    WHEN 'Goldsboro' THEN 'clm4'
    WHEN 'Nashville' THEN 'clm5'
    ELSE NULL
END
WHERE "clinicLocation" IS NOT NULL;

-- Drop old column
ALTER TABLE "ReferralSource" DROP COLUMN "clinicLocation";

-- AddForeignKey
ALTER TABLE "ReferralSource" ADD CONSTRAINT "ReferralSource_clinicLocationId_fkey" FOREIGN KEY ("clinicLocationId") REFERENCES "ClinicLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;