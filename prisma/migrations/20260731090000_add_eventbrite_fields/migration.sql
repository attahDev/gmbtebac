-- AlterTable
ALTER TABLE "events" ADD COLUMN     "eventbriteEventId" TEXT,
ADD COLUMN     "eventbriteAttendeeCount" INTEGER,
ADD COLUMN     "eventbriteSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_attendance" ADD COLUMN     "viaEventbrite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eventbriteAttendeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "event_attendance_eventbriteAttendeeId_key" ON "event_attendance"("eventbriteAttendeeId");
