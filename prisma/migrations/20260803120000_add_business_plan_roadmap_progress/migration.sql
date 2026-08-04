-- AlterTable
ALTER TABLE "business_plans" ADD COLUMN "completedRoadmapItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
