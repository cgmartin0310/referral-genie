-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "coverSheetCompanyInfo" TEXT,
ADD COLUMN     "coverSheetFromName" TEXT,
ADD COLUMN     "coverSheetFromNumber" TEXT,
ADD COLUMN     "coverSheetMessage" TEXT,
ADD COLUMN     "coverSheetSubject" TEXT,
ADD COLUMN     "includeCoverSheet" BOOLEAN NOT NULL DEFAULT true;
