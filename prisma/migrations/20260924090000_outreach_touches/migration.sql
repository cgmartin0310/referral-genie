-- Paragon's log of outreach touches on catalog practices.
CREATE TABLE "OutreachTouch" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'call',
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachTouch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutreachTouch_practiceId_createdAt_idx" ON "OutreachTouch"("practiceId", "createdAt");
