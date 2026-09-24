-- Therapy practices Paragon may recruit as subscribers.
CREATE TABLE "CoLead" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "countyFips" TEXT NOT NULL,
    "countyName" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "faxNumber" TEXT,
    "orgNpis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "therapists" JSONB NOT NULL,
    "pediatric" BOOLEAN NOT NULL DEFAULT false,
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "notes" TEXT,
    "assignee" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoLead_countyFips_key_key" ON "CoLead"("countyFips", "key");
CREATE INDEX "CoLead_countyFips_idx" ON "CoLead"("countyFips");
