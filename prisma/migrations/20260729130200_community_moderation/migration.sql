-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'FLAGGED';

-- AlterTable: posts now publish immediately; the moderation bot moves them
-- to FLAGGED after the fact instead of gating them before the fact.
ALTER TABLE "spotlight_stories" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
ALTER TABLE "spotlight_stories" ADD COLUMN "flagReason" TEXT;

-- AlterTable: same post-then-moderate treatment for comments.
ALTER TABLE "comments" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "comments" ADD COLUMN "flagReason" TEXT;
