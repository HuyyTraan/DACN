-- Retain old deliveries and their history when a cancelled schedule is submitted again.
ALTER TABLE publishing_deliveries ADD COLUMN IF NOT EXISTS plan_version integer NOT NULL DEFAULT 1;
UPDATE publishing_deliveries d SET plan_version=p.version FROM publishing_plans p WHERE p.id=d.plan_id AND p.status='scheduled';
DO $$ DECLARE constraint_name text; BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='publishing_deliveries'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (plan_id, account_id, item_index, occurrence)' LOOP
 EXECUTE format('ALTER TABLE publishing_deliveries DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS publishing_delivery_revision ON publishing_deliveries(plan_id,account_id,item_index,occurrence,plan_version);
