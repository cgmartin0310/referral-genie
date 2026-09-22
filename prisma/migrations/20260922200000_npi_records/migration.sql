-- The NPI dissemination file, filtered to referral-source taxonomies and
-- mapped to counties by practice ZIP. Pulling a county reads this table
-- instead of querying the NPPES API ZIP by ZIP.
CREATE TABLE "NpiRecord" (
    "npi" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "credential" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "primaryTaxonomyCode" TEXT NOT NULL,
    "taxonomyCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "countyFips" TEXT,
    "countyMatch" TEXT,
    "lastUpdated" TEXT,
    "loadedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpiRecord_pkey" PRIMARY KEY ("npi")
);

CREATE INDEX "NpiRecord_countyFips_idx" ON "NpiRecord"("countyFips");
CREATE INDEX "NpiRecord_state_city_idx" ON "NpiRecord"("state", "city");
CREATE INDEX "NpiRecord_zip_idx" ON "NpiRecord"("zip");

CREATE TABLE "NpiLoad" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsKept" INTEGER NOT NULL DEFAULT 0,
    "countyMapped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "NpiLoad_pkey" PRIMARY KEY ("id")
);
