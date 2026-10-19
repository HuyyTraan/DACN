-- Additive AI Analysis MVP tables. Rollback retains user imports and reports.
CREATE TABLE IF NOT EXISTS ai_import_batches (
 id uuid PRIMARY KEY,
 workspace_id integer NOT NULL REFERENCES studio_workspace(id),
 actor_id uuid REFERENCES studio_users(id),
 page_id text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 timezone text NOT NULL,
 source text NOT NULL CHECK (source IN ('manual','csv','demo')),
 source_label text NOT NULL DEFAULT '',
 metric_definition_version text NOT NULL,
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 imported_at timestamptz NOT NULL DEFAULT now(),
 CHECK (period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS ai_import_batches_timeline ON ai_import_batches(workspace_id,imported_at DESC);

CREATE TABLE IF NOT EXISTS ai_import_rows (
 id bigserial PRIMARY KEY,
 batch_id uuid NOT NULL REFERENCES ai_import_batches(id),
 workspace_id integer NOT NULL REFERENCES studio_workspace(id),
 page_id text NOT NULL,
 provider_post_id text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 timezone text NOT NULL,
 reach bigint CHECK (reach >= 0),
 impressions bigint CHECK (impressions >= 0),
 interactions bigint CHECK (interactions >= 0),
 link_clicks bigint CHECK (link_clicks >= 0),
 post_text text NOT NULL DEFAULT '',
 CHECK (period_start <= period_end),
 UNIQUE (workspace_id,page_id,provider_post_id,period_start,period_end)
);
CREATE INDEX IF NOT EXISTS ai_import_rows_overlap ON ai_import_rows(workspace_id,page_id,provider_post_id,period_start,period_end);

CREATE TABLE IF NOT EXISTS ai_analysis_runs (
 id uuid PRIMARY KEY,
 workspace_id integer NOT NULL REFERENCES studio_workspace(id),
 batch_id uuid NOT NULL REFERENCES ai_import_batches(id),
 actor_id uuid REFERENCES studio_users(id),
 page_id text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 input_hash text NOT NULL,
 input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot)='object'),
 kpis jsonb NOT NULL CHECK (jsonb_typeof(kpis)='object'),
 facts jsonb NOT NULL CHECK (jsonb_typeof(facts)='array'),
 limitations jsonb NOT NULL CHECK (jsonb_typeof(limitations)='array'),
 report jsonb,
 provider text NOT NULL DEFAULT 'gemini',
 model text NOT NULL,
 prompt_version text NOT NULL,
 schema_version text NOT NULL,
 status text NOT NULL CHECK (status IN ('reserved','completed','failed')),
 usage jsonb,
 estimated_cost_vnd numeric(18,4) NOT NULL DEFAULT 0,
 actual_cost_vnd numeric(18,4),
 error_text text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_analysis_runs_timeline ON ai_analysis_runs(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_analysis_runs_hash ON ai_analysis_runs(workspace_id,input_hash,status);
CREATE INDEX IF NOT EXISTS ai_analysis_runs_daily ON ai_analysis_runs(workspace_id,created_at);
