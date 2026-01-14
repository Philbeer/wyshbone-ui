-- Activity Log Table for local Wyshbone system activity tracking
-- Replaces Tower-based activity logging

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  
  -- Activity details
  activity_type TEXT NOT NULL, -- database_update, xero_sync, ai_discovery, entity_match, event_found, price_alert
  category TEXT NOT NULL, -- system, ai, sync, user
  title TEXT NOT NULL, -- "Found 12 new pubs"
  description TEXT, -- More details
  
  -- Context
  entity_type TEXT, -- pub, customer, order, supplier, event
  entity_id TEXT,
  metadata JSONB, -- Flexible data
  
  -- User (if user-triggered)
  user_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_log_workspace ON activity_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_category ON activity_log(category);

-- Index for combined workspace + time queries (most common)
CREATE INDEX IF NOT EXISTS idx_activity_log_workspace_time ON activity_log(workspace_id, created_at DESC);

COMMENT ON TABLE activity_log IS 'Local system activity tracking for Wyshbone background jobs, syncs, and AI discoveries';

