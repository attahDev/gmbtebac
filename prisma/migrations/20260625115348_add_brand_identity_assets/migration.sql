-- CreateEnum
CREATE TYPE "BrandAssetType" AS ENUM ('LOGO', 'BUSINESS_CARD', 'LETTERHEAD', 'EMAIL_SIGNATURE', 'INVOICE', 'QUOTATION', 'COMPANY_PROFILE', 'CAPABILITY_STATEMENT', 'BRAND_GUIDELINES');

-- CreateEnum
CREATE TYPE "BrandAssetStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "brand_assets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetType" "BrandAssetType" NOT NULL,
    "status" "BrandAssetStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentAssetId" TEXT,
    "jobId" TEXT,
    "inputsSnapshot" JSONB NOT NULL,
    "aiContent" JSONB,
    "pdfUrl" TEXT,
    "docxUrl" TEXT,
    "pngUrl" TEXT,
    "svgLightUrl" TEXT,
    "svgDarkUrl" TEXT,
    "pngTransparentUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_assets_userId_idx" ON "brand_assets"("userId");

-- CreateIndex
CREATE INDEX "brand_assets_assetType_idx" ON "brand_assets"("assetType");

-- CreateIndex
CREATE INDEX "brand_assets_status_idx" ON "brand_assets"("status");

-- AddForeignKey
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
