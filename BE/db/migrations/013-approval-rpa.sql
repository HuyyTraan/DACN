-- Keep one UI-reading job per plan revision; delete captured content with its plan.
ALTER TABLE studio_rpa_runs DROP CONSTRAINT IF EXISTS studio_rpa_runs_kind_check;
ALTER TABLE studio_rpa_runs ADD CONSTRAINT studio_rpa_runs_kind_check
    CHECK (kind IN ('dashboard_screenshot','weekly_csv','approval_read'));
ALTER TABLE studio_rpa_runs ADD COLUMN IF NOT EXISTS plan_id uuid;
ALTER TABLE studio_rpa_runs ADD COLUMN IF NOT EXISTS plan_version integer;
ALTER TABLE studio_rpa_runs ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE studio_rpa_runs ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE studio_rpa_runs ADD CONSTRAINT studio_rpa_runs_plan_fk
    FOREIGN KEY (plan_id) REFERENCES publishing_plans(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS studio_rpa_runs_approval_revision
    ON studio_rpa_runs(plan_id, plan_version)
    WHERE kind='approval_read';
CREATE INDEX IF NOT EXISTS studio_rpa_runs_approval_ready
    ON studio_rpa_runs(plan_id, plan_version)
    WHERE kind='approval_read' AND status='success';
