-- DropForeignKey
ALTER TABLE "news_comments" DROP CONSTRAINT "news_comments_userId_fkey";

-- AlterTable
ALTER TABLE "news_comments" ALTER COLUMN "userId" DROP NOT NULL,
ADD COLUMN "authorName" TEXT;

-- AddForeignKey
ALTER TABLE "news_comments" ADD CONSTRAINT "news_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
