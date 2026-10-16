-- Rejection is a review decision, distinct from an expired or cancelled schedule.
ALTER TABLE publishing_plans DROP CONSTRAINT IF EXISTS publishing_plans_status_check;
ALTER TABLE publishing_plans ADD CONSTRAINT publishing_plans_status_check
 CHECK (status IN ('draft','pending','scheduled','cancelled','rejected'));
CREATE INDEX IF NOT EXISTS publishing_review_queue ON publishing_plans(updated_at DESC)
 WHERE status IN ('pending','scheduled','rejected');
