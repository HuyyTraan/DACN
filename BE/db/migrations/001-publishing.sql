BEGIN;
CREATE TABLE IF NOT EXISTS publishing_plans (
    id UUID PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','scheduled','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS publishing_deliveries (
    id UUID PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES publishing_plans(id),
    account_id TEXT NOT NULL,
    item_index INTEGER NOT NULL CHECK (item_index >= 0),
    occurrence INTEGER NOT NULL DEFAULT 0 CHECK (occurrence >= 0),
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','published','failed','unknown','cancelled')),
    provider_post_id TEXT,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    UNIQUE (plan_id, account_id, item_index, occurrence)
);
CREATE INDEX IF NOT EXISTS publishing_due ON publishing_deliveries(due_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS publishing_plan_deliveries ON publishing_deliveries(plan_id);
COMMIT;
