-- AlterTable
ALTER TABLE "business_plans" ADD COLUMN "completedActionIndexes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
