-- Durable approval notifications and read-only RPA history. Existing records stay intact.
CREATE TABLE IF NOT EXISTS studio_automation_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES publishing_plans(id),
    plan_version integer NOT NULL,
    recipient_user_id uuid NOT NULL REFERENCES studio_users(id),
    recipient_email text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('approval_requested','approval_due_soon','approval_overdue')),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    sent_at timestamptz,
    UNIQUE(plan_id,plan_version,recipient_user_id,kind)
);
CREATE INDEX IF NOT EXISTS studio_automation_messages_queue ON studio_automation_messages(created_at) WHERE status='queued';

CREATE TABLE IF NOT EXISTS studio_rpa_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('dashboard_screenshot','weekly_csv')),
    actor_id uuid REFERENCES studio_users(id),
    status text NOT NULL CHECK (status IN ('queued','running','success','failed')),
    scheduled_on date,
    artifact_name text,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS studio_rpa_runs_latest ON studio_rpa_runs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS studio_rpa_runs_schedule ON studio_rpa_runs(kind,scheduled_on) WHERE scheduled_on IS NOT NULL;

CREATE OR REPLACE FUNCTION studio_queue_approval_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status<>'pending' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' THEN
        IF OLD.version=NEW.version THEN RETURN NEW; END IF;
    END IF;
    INSERT INTO studio_automation_messages(plan_id,plan_version,recipient_user_id,recipient_email,kind)
    SELECT NEW.id,NEW.version,u.id,u.email,'approval_requested'
    FROM studio_users u WHERE u.workspace_id=1 AND u.active AND u.role IN ('admin','manager')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_approval_email_trigger ON publishing_plans;
CREATE TRIGGER studio_approval_email_trigger AFTER INSERT OR UPDATE ON publishing_plans
FOR EACH ROW EXECUTE FUNCTION studio_queue_approval_email();
