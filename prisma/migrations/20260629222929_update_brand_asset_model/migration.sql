/*
  Warnings:

  - A unique constraint covering the columns `[externalAssetId]` on the table `brand_assets` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "brand_assets" DROP CONSTRAINT "brand_assets_userId_fkey";

-- AlterTable
ALTER TABLE "brand_assets" ADD COLUMN     "externalAssetId" TEXT,
ADD COLUMN     "rawResponse" JSONB,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "brand_assets_externalAssetId_key" ON "brand_assets"("externalAssetId");

-- AddForeignKey
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
