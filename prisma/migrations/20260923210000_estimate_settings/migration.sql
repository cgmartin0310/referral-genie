-- The referral estimate's rate table, per discipline and provider type.
CREATE TABLE "EstimateSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rates" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstimateSettings_organizationId_key" ON "EstimateSettings"("organizationId");

ALTER TABLE "EstimateSettings" ADD CONSTRAINT "EstimateSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
