-- Which specialties the shared county catalog pulls.
CREATE TABLE "CatalogSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabledGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogSettings_organizationId_key" ON "CatalogSettings"("organizationId");

ALTER TABLE "CatalogSettings" ADD CONSTRAINT "CatalogSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
