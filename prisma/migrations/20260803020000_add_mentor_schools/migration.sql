-- Academy: reviewer-matching for the mentor-review certification gate

-- Mentor: Schools this mentor is authorised to review projects for.
-- Empty array (the default) = unrestricted, so existing mentors are
-- unaffected until an admin explicitly assigns them Schools.
ALTER TABLE "mentors" ADD COLUMN "schools" TEXT[] NOT NULL DEFAULT '{}';
