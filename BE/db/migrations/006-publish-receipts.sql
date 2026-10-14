-- Persistent immediate-publish receipts. Pending/unknown is never retried automatically.
CREATE TABLE studio_publish_requests (
 id uuid PRIMARY KEY, workspace_id integer NOT NULL REFERENCES studio_workspace(id),
 actor_id uuid REFERENCES studio_users(id), fingerprint text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','published','failed','unknown')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_publish_requests_workspace ON studio_publish_requests(workspace_id,created_at DESC);
CREATE INDEX studio_publish_requests_actor ON studio_publish_requests(actor_id);
