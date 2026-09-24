-- Campaign fax documents live in the database: the server's disk is wiped on every deploy.
CREATE TABLE "FaxDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaxDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FaxDocument_organizationId_idx" ON "FaxDocument"("organizationId");

ALTER TABLE "FaxDocument" ADD CONSTRAINT "FaxDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
