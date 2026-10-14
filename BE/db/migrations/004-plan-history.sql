-- Forward-only. Keep history on rollback.
CREATE TABLE IF NOT EXISTS studio_plan_history (
 id bigserial PRIMARY KEY, plan_id uuid NOT NULL REFERENCES publishing_plans(id),
 version integer NOT NULL, status text NOT NULL, payload jsonb NOT NULL,
 actor_id uuid REFERENCES studio_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_plan_history_plan ON studio_plan_history(plan_id,id DESC);
CREATE OR REPLACE FUNCTION studio_track_plan() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' OR OLD.version IS DISTINCT FROM NEW.version OR OLD.status IS DISTINCT FROM NEW.status THEN
 INSERT INTO studio_plan_history(plan_id,version,status,payload,actor_id) VALUES(NEW.id,NEW.version,NEW.status,NEW.payload,COALESCE(NEW.updated_by,NEW.created_by));
 END IF;RETURN NEW;END; $$;
DROP TRIGGER IF EXISTS studio_plan_history_trigger ON publishing_plans;
CREATE TRIGGER studio_plan_history_trigger AFTER INSERT OR UPDATE ON publishing_plans FOR EACH ROW EXECUTE FUNCTION studio_track_plan();
