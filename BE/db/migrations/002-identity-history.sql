-- Additive. Rollback: roll back application, retain these tables and all historical data.
CREATE TABLE IF NOT EXISTS studio_workspace (
 id integer PRIMARY KEY, name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS studio_users (
 id uuid PRIMARY KEY, workspace_id integer NOT NULL REFERENCES studio_workspace(id),
 email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','manager','editor','viewer')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_users_workspace ON studio_users(workspace_id);
CREATE TABLE IF NOT EXISTS studio_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES studio_users(id),
 csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_sessions_user ON studio_sessions(user_id);
CREATE INDEX IF NOT EXISTS studio_sessions_expiry ON studio_sessions(expires_at);
CREATE TABLE IF NOT EXISTS studio_audit (
 id bigserial PRIMARY KEY, workspace_id integer NOT NULL REFERENCES studio_workspace(id),
 actor_id uuid REFERENCES studio_users(id), action text NOT NULL, entity text NOT NULL,
 entity_id text, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_audit_timeline ON studio_audit(workspace_id,id DESC);
CREATE TABLE IF NOT EXISTS studio_snapshot_history (
 id bigserial PRIMARY KEY, workspace_id integer NOT NULL REFERENCES studio_workspace(id),
 version integer NOT NULL, data jsonb NOT NULL, actor_id uuid REFERENCES studio_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,version)
);
ALTER TABLE publishing_plans ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES studio_users(id);
ALTER TABLE publishing_plans ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES studio_users(id);
CREATE INDEX IF NOT EXISTS publishing_plans_creator ON publishing_plans(created_by);
CREATE INDEX IF NOT EXISTS publishing_plans_updater ON publishing_plans(updated_by);
