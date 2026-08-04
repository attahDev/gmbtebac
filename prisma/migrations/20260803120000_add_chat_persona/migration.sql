-- CreateEnum
CREATE TYPE "ChatPersona" AS ENUM ('NORA', 'DIGITAL_TRUST');

-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN "persona" "ChatPersona" NOT NULL DEFAULT 'NORA';
