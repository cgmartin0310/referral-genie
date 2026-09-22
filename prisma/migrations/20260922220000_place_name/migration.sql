-- Business name from Google Places, so a practice with no organization NPI
-- is named by its listing rather than its street.
ALTER TABLE "ReferralSource" ADD COLUMN "placeName" TEXT;
