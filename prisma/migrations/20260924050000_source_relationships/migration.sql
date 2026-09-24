-- Referral sources a subscriber already works with, and their trust scores.
CREATE TABLE "SourceRelationship" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT,
    "practiceId" TEXT,
    "matchedBy" TEXT,
    "name" TEXT NOT NULL,
    "practiceName" TEXT,
    "npi" TEXT,
    "specialty" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "type" TEXT NOT NULL DEFAULT 'practice',
    "lastReferral" TEXT,
    "referralVolume" TEXT,
    "strength" TEXT,
    "origin" TEXT,
    "trs" INTEGER NOT NULL DEFAULT 0,
    "createdFrom" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRelationship_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceRelationship_organizationId_idx" ON "SourceRelationship"("organizationId");
CREATE INDEX "SourceRelationship_practiceId_idx" ON "SourceRelationship"("practiceId");

ALTER TABLE "SourceRelationship" ADD CONSTRAINT "SourceRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
