-- Practices and providers.
--
-- A referral source is a practice location. Identity is the location, not the
-- organization: NPPES does not link an individual to an employer org NPI, most
-- locations in a county pull carry no NPI-2, one org NPI can span several
-- addresses, and one address can host several org NPIs. Org numbers are kept on
-- Practice."orgNpis".
--
-- Providers are the NPI-1 members. Their count and taxonomy mix drive the
-- referral estimate. Fax goes to the practice unless Provider."useOwnFax" is set.

CREATE TABLE "Practice" (
    "id" TEXT NOT NULL,
    "practiceKey" TEXT NOT NULL,
    "placeId" TEXT,
    "name" TEXT NOT NULL,
    "nameAmbiguous" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "countyName" TEXT,
    "countyFips" TEXT,
    "phone" TEXT,
    "faxNumber" TEXT,
    "orgNpis" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "providerCount" INTEGER NOT NULL DEFAULT 0,
    "taxonomyMix" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Practice_organizationId_practiceKey_key" ON "Practice"("organizationId", "practiceKey");

CREATE INDEX "Practice_organizationId_countyFips_idx" ON "Practice"("organizationId", "countyFips");

CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "npiNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryTaxonomyCode" TEXT,
    "taxonomyCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sourceType" TEXT,
    "countyFips" TEXT,
    "faxNumber" TEXT,
    "useOwnFax" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "practiceId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Provider_organizationId_npiNumber_key" ON "Provider"("organizationId", "npiNumber");

CREATE INDEX "Provider_practiceId_idx" ON "Provider"("practiceId");

CREATE INDEX "Provider_organizationId_countyFips_idx" ON "Provider"("organizationId", "countyFips");

ALTER TABLE "Practice" ADD CONSTRAINT "Practice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Provider" ADD CONSTRAINT "Provider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Provider" ADD CONSTRAINT "Provider_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
