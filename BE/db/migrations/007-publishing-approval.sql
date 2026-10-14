-- Add approval queue without changing existing approved schedules.
ALTER TABLE publishing_plans DROP CONSTRAINT IF EXISTS publishing_plans_status_check;
ALTER TABLE publishing_plans ADD CONSTRAINT publishing_plans_status_check
 CHECK (status IN ('draft','pending','scheduled','cancelled'));
CREATE INDEX IF NOT EXISTS publishing_pending ON publishing_plans ((payload->>'scheduledAt'))
 WHERE status='pending';
