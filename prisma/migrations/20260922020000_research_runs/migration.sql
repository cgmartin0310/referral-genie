-- Fields the research agent may fill when they are still blank.
ALTER TABLE "ReferralSource" ADD COLUMN "referralFormUrl" TEXT;
ALTER TABLE "ReferralSource" ADD COLUMN "preferredChannel" TEXT;

-- Durable research job. One HTTP request researches one practice, then resumes.
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "cursor" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "error" TEXT,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchRun_organizationId_scopeKey_createdAt_idx" ON "ResearchRun"("organizationId", "scopeKey", "createdAt");

ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
