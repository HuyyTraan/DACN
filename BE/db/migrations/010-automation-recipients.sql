-- Test-only .test addresses must never be handed to a real SMTP transport.
UPDATE studio_automation_messages
SET status = 'cancelled'
WHERE status = 'queued' AND recipient_email ~* '\.test$';

CREATE OR REPLACE FUNCTION studio_queue_approval_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.version = NEW.version THEN RETURN NEW; END IF;
    INSERT INTO studio_automation_messages(plan_id, plan_version, recipient_user_id, recipient_email, kind)
    SELECT NEW.id, NEW.version, u.id, u.email, 'approval_requested'
    FROM studio_users u
    WHERE u.workspace_id = 1 AND u.active AND u.role IN ('admin', 'manager')
      AND u.email !~* '\.test$'
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
