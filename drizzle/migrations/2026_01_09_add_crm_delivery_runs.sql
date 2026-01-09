-- Create crm_delivery_runs table for delivery route management
CREATE TABLE IF NOT EXISTS crm_delivery_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  driver_name TEXT,
  vehicle TEXT,
  scheduled_date BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS crm_delivery_runs_workspace_id_idx ON crm_delivery_runs(workspace_id);
CREATE INDEX IF NOT EXISTS crm_delivery_runs_status_idx ON crm_delivery_runs(status);
CREATE INDEX IF NOT EXISTS crm_delivery_runs_scheduled_date_idx ON crm_delivery_runs(scheduled_date);
