-- Academy: "By Certification" filter for Opportunities

-- Opportunity: restrict to holders of a specific School's certification.
-- Null (the default) = open to everyone, matching the existing pattern
-- for Mentor.schools.
ALTER TABLE "opportunities" ADD COLUMN "requiredSchool" TEXT;
CREATE INDEX "opportunities_requiredSchool_idx" ON "opportunities"("requiredSchool");
