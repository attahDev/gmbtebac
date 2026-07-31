-- CreateTable
CREATE TABLE "news_comments" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_comments_articleId_idx" ON "news_comments"("articleId");

-- AddForeignKey
ALTER TABLE "news_comments" ADD CONSTRAINT "news_comments_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_comments" ADD CONSTRAINT "news_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
