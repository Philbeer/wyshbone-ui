-- Create agent_runs table for first-class Run lifecycle management
-- This table is the authoritative source for terminal state detection
-- Status should NEVER be inferred from events - only from this table

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  client_request_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting'
    CHECK (status IN ('starting', 'planning', 'executing', 'finalizing', 'completed', 'failed', 'stopped')),
  terminal_state TEXT
    CHECK (terminal_state IS NULL OR terminal_state IN ('completed', 'failed', 'stopped')),
  ui_ready INTEGER NOT NULL DEFAULT 0
    CHECK (ui_ready IN (0, 1)),
  last_event_at BIGINT,
  error TEXT,
  error_details JSONB,
  metadata JSONB
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS agent_runs_client_request_id_idx ON agent_runs(client_request_id);
CREATE INDEX IF NOT EXISTS agent_runs_user_id_idx ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs(status);
CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx ON agent_runs(created_at);
CREATE INDEX IF NOT EXISTS agent_runs_user_id_created_at_idx ON agent_runs(user_id, created_at);

-- Add run_id column to agent_activities if not exists (for linking activities to runs)
-- This is done with ALTER TABLE wrapped in a DO block to handle if column already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_activities' AND column_name = 'agent_run_id'
  ) THEN
    ALTER TABLE agent_activities ADD COLUMN agent_run_id TEXT;
    CREATE INDEX IF NOT EXISTS agent_activities_agent_run_id_idx ON agent_activities(agent_run_id);
  END IF;
END $$;
