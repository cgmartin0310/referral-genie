-- Subscribers sign in through Clerk organizations. The original organization
-- runs the program (Paragon) and owns the shared county catalog.
ALTER TABLE "Organization" ADD COLUMN "clerkOrgId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'subscriber';
CREATE UNIQUE INDEX "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");
UPDATE "Organization" SET "kind" = 'paragon', "name" = 'Paragon' WHERE "id" = 'org_default';
