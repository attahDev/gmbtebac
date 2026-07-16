-- CreateTable
CREATE TABLE "business_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessIdea" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "skills" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "experienceLevel" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "aiResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_plans_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
