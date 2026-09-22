-- Which loader run wrote each NPI row, so a completed load can remove rows
-- the new file no longer has without comparing timestamps.
ALTER TABLE "NpiRecord" ADD COLUMN "loadId" TEXT;
CREATE INDEX "NpiRecord_loadId_idx" ON "NpiRecord"("loadId");
