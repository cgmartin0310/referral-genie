-- A campaign's audience is a clinic's referral list. Each target is one fax:
-- everyone at a practice who resolves to the same machine shares a target.
-- The number and names are snapshotted so what was sent can be shown later.

ALTER TABLE "Campaign" ADD COLUMN "audienceClinicId" TEXT;

CREATE INDEX "Campaign_audienceClinicId_idx" ON "Campaign"("audienceClinicId");

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_audienceClinicId_fkey" FOREIGN KEY ("audienceClinicId") REFERENCES "ClinicLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CampaignTarget" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "practiceId" TEXT,
    "practiceName" TEXT NOT NULL,
    "providerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "providerNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "toName" TEXT NOT NULL,
    "faxNumber" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "responseAt" TIMESTAMP(3),
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "CampaignTarget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignTarget_campaignId_idx" ON "CampaignTarget"("campaignId");

CREATE INDEX "CampaignTarget_organizationId_idx" ON "CampaignTarget"("organizationId");

ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
