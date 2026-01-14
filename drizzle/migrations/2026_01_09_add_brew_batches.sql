-- Create brew_batches table for brewery batch tracking
CREATE TABLE IF NOT EXISTS brew_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_code TEXT NOT NULL,
  brew_date BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  planned_volume_litres INTEGER NOT NULL,
  actual_volume_litres INTEGER,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS brew_batches_workspace_id_idx ON brew_batches(workspace_id);
CREATE INDEX IF NOT EXISTS brew_batches_product_id_idx ON brew_batches(product_id);
CREATE INDEX IF NOT EXISTS brew_batches_status_idx ON brew_batches(status);
CREATE INDEX IF NOT EXISTS brew_batches_batch_code_idx ON brew_batches(batch_code);
