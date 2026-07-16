/*
  Warnings:

  - You are about to drop the column `name` on the `users` table. All the data in the column will be lost.
  - Added the required column `firstname` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastname` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'PROFESSIONAL', 'STARTUP', 'ENGINEER', 'OTHER');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "name",
ADD COLUMN     "agreedToTerms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "firstname" TEXT NOT NULL,
ADD COLUMN     "lastname" TEXT NOT NULL,
ADD COLUMN     "organization" TEXT,
ADD COLUMN     "role" "UserRole",
ADD COLUMN     "subscribedToNews" BOOLEAN NOT NULL DEFAULT false;
