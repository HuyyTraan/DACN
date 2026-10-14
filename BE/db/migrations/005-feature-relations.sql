-- Additive nullable relations. Existing extension records remain valid.
ALTER TABLE studio_workflow_runs ADD COLUMN IF NOT EXISTS workflow_id text;
ALTER TABLE studio_metrics ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE studio_metrics ADD COLUMN IF NOT EXISTS post_id text;
ALTER TABLE studio_traffic_events ADD COLUMN IF NOT EXISTS customer_id text;
ALTER TABLE studio_approvals ADD COLUMN IF NOT EXISTS post_id text;
ALTER TABLE studio_notifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES studio_users(id);
ALTER TABLE studio_workflow_runs ADD CONSTRAINT studio_run_workflow_fk FOREIGN KEY(workspace_id,workflow_id) REFERENCES studio_workflows(workspace_id,id);
ALTER TABLE studio_metrics ADD CONSTRAINT studio_metric_account_fk FOREIGN KEY(workspace_id,account_id) REFERENCES studio_social_accounts(workspace_id,id);
ALTER TABLE studio_metrics ADD CONSTRAINT studio_metric_post_fk FOREIGN KEY(workspace_id,post_id) REFERENCES studio_posts(workspace_id,id);
ALTER TABLE studio_traffic_events ADD CONSTRAINT studio_traffic_customer_fk FOREIGN KEY(workspace_id,customer_id) REFERENCES studio_customers(workspace_id,id);
ALTER TABLE studio_approvals ADD CONSTRAINT studio_approval_post_fk FOREIGN KEY(workspace_id,post_id) REFERENCES studio_posts(workspace_id,id);
CREATE INDEX IF NOT EXISTS studio_run_workflow ON studio_workflow_runs(workspace_id,workflow_id);
CREATE INDEX IF NOT EXISTS studio_metric_account ON studio_metrics(workspace_id,account_id);
CREATE INDEX IF NOT EXISTS studio_metric_post ON studio_metrics(workspace_id,post_id);
CREATE INDEX IF NOT EXISTS studio_traffic_customer ON studio_traffic_events(workspace_id,customer_id);
CREATE INDEX IF NOT EXISTS studio_approval_post ON studio_approvals(workspace_id,post_id);
CREATE INDEX IF NOT EXISTS studio_notification_user ON studio_notifications(user_id);
