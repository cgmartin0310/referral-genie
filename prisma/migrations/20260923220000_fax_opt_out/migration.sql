-- The opt-out line on every campaign fax page: sender, and a free phone and fax to stop faxes.
CREATE TABLE "FaxSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "senderName" TEXT,
    "optOutPhone" TEXT,
    "optOutFax" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaxSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FaxSettings_organizationId_key" ON "FaxSettings"("organizationId");

ALTER TABLE "FaxSettings" ADD CONSTRAINT "FaxSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
