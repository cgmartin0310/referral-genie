-- A subscriber's approve or exclude decision on each prospect, logged.
CREATE TABLE "ProspectDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProspectDecision_organizationId_practiceId_key" ON "ProspectDecision"("organizationId", "practiceId");
CREATE INDEX "ProspectDecision_organizationId_idx" ON "ProspectDecision"("organizationId");

ALTER TABLE "ProspectDecision" ADD CONSTRAINT "ProspectDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
