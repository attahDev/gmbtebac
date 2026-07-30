-- CreateTable
CREATE TABLE "news_articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "coverImageUrl" TEXT,
    "body" TEXT,
    "externalLink" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_articles_isActive_idx" ON "news_articles"("isActive");

-- CreateIndex
CREATE INDEX "news_articles_publishedAt_idx" ON "news_articles"("publishedAt");

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
