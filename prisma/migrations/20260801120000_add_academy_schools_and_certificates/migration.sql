-- Academy: Schools grouping + certification journey + certificates

-- Course: add "school" grouping (Microsoft/AWS/GCP/NVIDIA/etc), index it
ALTER TABLE "courses" ADD COLUMN "school" TEXT;
CREATE INDEX "courses_school_idx" ON "courses"("school");

-- ModuleProgress: per-quiz-section score storage
ALTER TABLE "module_progress" ADD COLUMN "quizScores" JSONB;

-- CertificateStatus enum for the certification journey
CREATE TYPE "CertificateStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'QUIZZES_PASSED',
  'PROJECT_SUBMITTED',
  'CHANGES_REQUESTED',
  'CERTIFIED'
);

-- CourseProgress: mentor-review gate fields
ALTER TABLE "course_progress" ADD COLUMN "projectSubmissionUrl" TEXT;
ALTER TABLE "course_progress" ADD COLUMN "projectSubmittedAt" TIMESTAMP(3);
ALTER TABLE "course_progress" ADD COLUMN "reviewedByUserId" TEXT;
ALTER TABLE "course_progress" ADD COLUMN "mentorFeedback" TEXT;
ALTER TABLE "course_progress" ADD COLUMN "certificateStatus" "CertificateStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- Certificate table
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "issuedByUserId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificates_verificationCode_key" ON "certificates"("verificationCode");
CREATE INDEX "certificates_userId_idx" ON "certificates"("userId");
CREATE INDEX "certificates_courseId_idx" ON "certificates"("courseId");

ALTER TABLE "certificates" ADD CONSTRAINT "certificates_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
