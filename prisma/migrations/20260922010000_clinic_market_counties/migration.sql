-- Counties a clinic serves. The NPI pull still depends on a ZIP list per county.
CREATE TABLE "ClinicMarketCounty" (
    "id" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "countyFips" TEXT NOT NULL,
    "countyName" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicMarketCounty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicMarketCounty_clinicLocationId_countyFips_key" ON "ClinicMarketCounty"("clinicLocationId", "countyFips");

CREATE INDEX "ClinicMarketCounty_clinicLocationId_idx" ON "ClinicMarketCounty"("clinicLocationId");

ALTER TABLE "ClinicMarketCounty" ADD CONSTRAINT "ClinicMarketCounty_clinicLocationId_fkey" FOREIGN KEY ("clinicLocationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
