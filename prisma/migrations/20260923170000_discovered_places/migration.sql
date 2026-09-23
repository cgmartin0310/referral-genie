-- Practices Google lists in a county. The referral source list is built from these.
CREATE TABLE "DiscoveredPlace" (
    "id" TEXT NOT NULL,
    "countyFips" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "businessStatus" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "origin" TEXT NOT NULL DEFAULT 'search',
    "detailsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "DiscoveredPlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscoveredPlace_organizationId_placeId_key" ON "DiscoveredPlace"("organizationId", "placeId");
CREATE INDEX "DiscoveredPlace_organizationId_countyFips_idx" ON "DiscoveredPlace"("organizationId", "countyFips");

ALTER TABLE "DiscoveredPlace" ADD CONSTRAINT "DiscoveredPlace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
