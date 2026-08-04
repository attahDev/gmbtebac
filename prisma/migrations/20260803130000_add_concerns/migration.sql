-- CreateEnum
CREATE TYPE "ConcernType" AS ENUM ('DATA_PRIVACY', 'AI_RECOMMENDATION', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "ConcernStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED');

-- CreateTable
CREATE TABLE "concerns" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "concernType" "ConcernType" NOT NULL,
    "description" TEXT NOT NULL,
    "contactEmail" TEXT,
    "status" "ConcernStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concerns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concerns_userId_idx" ON "concerns"("userId");

-- CreateIndex
CREATE INDEX "concerns_status_idx" ON "concerns"("status");

-- AddForeignKey
ALTER TABLE "concerns" ADD CONSTRAINT "concerns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
