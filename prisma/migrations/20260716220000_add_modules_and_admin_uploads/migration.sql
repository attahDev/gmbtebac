-- Modules: upload-driven lesson content for Course (education + climate/green-impact).
-- Replaces the old hardcoded sustainabilityCourses.ts / academy equivalent as the
-- data source. Nothing here seeds fake lesson content — modules only exist once
-- an admin uploads one.

-- Course gets slug (stable URL id) + metadata (display fields that used to be
-- hardcoded: image, duration, contactHours, mode, level, learningOutcomes...).
ALTER TABLE "courses" ADD COLUMN "slug" TEXT;
ALTER TABLE "courses" ADD COLUMN "metadata" JSONB;

-- Backfill slug for any pre-existing rows from title, so the unique constraint
-- below doesn't fail on rows created before this migration.
UPDATE "courses"
SET "slug" = lower(regexp_replace(regexp_replace(trim("title"), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')) || '-' || substr("id", 1, 8)
WHERE "slug" IS NULL;

ALTER TABLE "courses" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modules_courseId_slug_key" ON "modules"("courseId", "slug");
CREATE INDEX "modules_courseId_idx" ON "modules"("courseId");
CREATE INDEX "modules_courseId_order_idx" ON "modules"("courseId", "order");

ALTER TABLE "modules" ADD CONSTRAINT "modules_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- totalModules used to default to 1 and be hand-set. It's now a synced cache of
-- COUNT(modules), so existing rows should reflect reality (0, since no Module
-- rows exist yet at migration time) rather than the old default.
ALTER TABLE "courses" ALTER COLUMN "totalModules" SET DEFAULT 0;
UPDATE "courses" SET "totalModules" = 0;
