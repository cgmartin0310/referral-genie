-- Default practice organization. Existing rows are backfilled to this id
-- so the single-practice app keeps working after organizationId is required.
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('org_default', 'Default practice', 'default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE "CountyIngestRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,
    "countyName" TEXT NOT NULL,
    "countyFips" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "phase" TEXT NOT NULL DEFAULT 'nppes',
    "cursor" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "error" TEXT,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountyIngestRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CountyIngestRun_organizationId_countyId_createdAt_idx" ON "CountyIngestRun"("organizationId", "countyId", "createdAt");

ALTER TABLE "CountyIngestRun" ADD CONSTRAINT "CountyIngestRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ClinicLocation
ALTER TABLE "ClinicLocation" ADD COLUMN "organizationId" TEXT;
UPDATE "ClinicLocation" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
ALTER TABLE "ClinicLocation" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ClinicLocation" ADD CONSTRAINT "ClinicLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "ClinicLocation_name_key";
CREATE UNIQUE INDEX "ClinicLocation_organizationId_name_key" ON "ClinicLocation"("organizationId", "name");
CREATE INDEX "ClinicLocation_organizationId_idx" ON "ClinicLocation"("organizationId");

-- ReferralSource graph fields + organization
ALTER TABLE "ReferralSource" ADD COLUMN "taxonomyCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "primaryTaxonomyCode" TEXT,
ADD COLUMN "enumerationType" TEXT,
ADD COLUMN "countyName" TEXT,
ADD COLUMN "countyFips" TEXT,
ADD COLUMN "placeId" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "reviewCount" INTEGER,
ADD COLUMN "businessStatus" TEXT,
ADD COLUMN "sourceType" TEXT,
ADD COLUMN "provenance" JSONB,
ADD COLUMN "placesMatchStatus" TEXT,
ADD COLUMN "likelyDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "duplicateClusterKey" TEXT,
ADD COLUMN "addressFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "organizationId" TEXT;

UPDATE "ReferralSource" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
ALTER TABLE "ReferralSource" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ReferralSource" ADD CONSTRAINT "ReferralSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Blank NPIs are not identifiers. Postgres unique indexes treat '' as a
-- value, so multiple manual CRM / Places rows in one organization collide
-- (23505 on organizationId, npiNumber). NULL does not collide, which matches
-- upsert-by-NPI: lookup only when an NPI is present.
UPDATE "ReferralSource"
SET "npiNumber" = NULL
WHERE "npiNumber" IS NOT NULL
  AND "npiNumber" ~ '^[[:space:]]*$';

CREATE UNIQUE INDEX "ReferralSource_organizationId_npiNumber_key" ON "ReferralSource"("organizationId", "npiNumber");
CREATE INDEX "ReferralSource_organizationId_countyFips_idx" ON "ReferralSource"("organizationId", "countyFips");
CREATE INDEX "ReferralSource_organizationId_idx" ON "ReferralSource"("organizationId");

-- ReferralCategory: seed the ICP source types and scope uniqueness to the org
ALTER TABLE "ReferralCategory" ADD COLUMN "organizationId" TEXT;
UPDATE "ReferralCategory" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
ALTER TABLE "ReferralCategory" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ReferralCategory" ADD CONSTRAINT "ReferralCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "ReferralCategory_name_key";
CREATE UNIQUE INDEX "ReferralCategory_organizationId_name_key" ON "ReferralCategory"("organizationId", "name");
CREATE INDEX "ReferralCategory_organizationId_idx" ON "ReferralCategory"("organizationId");

INSERT INTO "ReferralCategory" ("id", "name", "description", "organizationId", "createdAt", "updatedAt")
VALUES
    (
        'cat_pediatrician',
        'Pediatrician',
        'Primary NUCC group pediatrics: 208000000X, 2080A0000X, 2080P0006X.',
        'org_default',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'cat_pcp_family_medicine',
        'Primary Care - Family Medicine',
        'Primary NUCC group family medicine: 207Q00000X, 207QA0505X, 207QG0300X.',
        'org_default',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'cat_pcp_internal_medicine',
        'Primary Care - Internal Medicine',
        'Primary NUCC group internal medicine: 207R00000X, 207RG0300X.',
        'org_default',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'cat_pcp_general_practice',
        'Primary Care - General Practice',
        'Primary NUCC group general practice: 208D00000X.',
        'org_default',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ("id") DO NOTHING;

-- Interaction
ALTER TABLE "Interaction" ADD COLUMN "organizationId" TEXT;
UPDATE "Interaction" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
ALTER TABLE "Interaction" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Interaction_organizationId_idx" ON "Interaction"("organizationId");

-- Campaign
ALTER TABLE "Campaign" ADD COLUMN "organizationId" TEXT;
UPDATE "Campaign" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
ALTER TABLE "Campaign" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CampaignToReferralSource
ALTER TABLE "CampaignToReferralSource" ADD COLUMN "organizationId" TEXT;
UPDATE "CampaignToReferralSource" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
ALTER TABLE "CampaignToReferralSource" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CampaignToReferralSource" ADD CONSTRAINT "CampaignToReferralSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CampaignToReferralSource_organizationId_idx" ON "CampaignToReferralSource"("organizationId");
