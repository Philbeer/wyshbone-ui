-- Create brew_settings table for brewery configuration
CREATE TABLE IF NOT EXISTS brew_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  default_warehouse_location TEXT,
  default_duty_rate_per_litre INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create index
CREATE INDEX IF NOT EXISTS brew_settings_workspace_id_idx ON brew_settings(workspace_id);
