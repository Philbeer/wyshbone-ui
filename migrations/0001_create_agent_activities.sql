-- Migration: Create agent_activities table
-- Created: 2026-01-04
-- Purpose: Store autonomous agent actions for tracking, analysis, and user notifications

-- Create agent_activities table
CREATE TABLE IF NOT EXISTS agent_activities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  task_generated TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  action_params JSONB,
  results JSONB,
  interesting_flag INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  duration_ms INTEGER,
  conversation_id TEXT,
  run_id TEXT,
  metadata JSONB,
  created_at BIGINT NOT NULL
);

-- Create indexes for common query patterns
-- Index for querying by user and time (most common query)
CREATE INDEX IF NOT EXISTS agent_activities_user_id_timestamp_idx
  ON agent_activities(user_id, timestamp DESC);

-- Index for filtering interesting activities
CREATE INDEX IF NOT EXISTS agent_activities_interesting_flag_idx
  ON agent_activities(interesting_flag, timestamp DESC)
  WHERE interesting_flag = 1;

-- Index for querying by status
CREATE INDEX IF NOT EXISTS agent_activities_status_idx
  ON agent_activities(status, timestamp DESC);

-- Index for grouping activities by run
CREATE INDEX IF NOT EXISTS agent_activities_run_id_idx
  ON agent_activities(run_id, timestamp DESC)
  WHERE run_id IS NOT NULL;

-- Index for linking to conversations
CREATE INDEX IF NOT EXISTS agent_activities_conversation_id_idx
  ON agent_activities(conversation_id)
  WHERE conversation_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE agent_activities IS 'Stores autonomous agent activities including task generation, execution, and outcomes';
COMMENT ON COLUMN agent_activities.id IS 'Unique identifier for the activity';
COMMENT ON COLUMN agent_activities.user_id IS 'User who triggered or owns this agent activity';
COMMENT ON COLUMN agent_activities.timestamp IS 'Unix timestamp (milliseconds) when activity occurred';
COMMENT ON COLUMN agent_activities.task_generated IS 'Description of task the agent decided to do';
COMMENT ON COLUMN agent_activities.action_taken IS 'Action executed (tool name, API call, etc.)';
COMMENT ON COLUMN agent_activities.action_params IS 'JSON parameters passed to the action';
COMMENT ON COLUMN agent_activities.results IS 'JSON results from action execution';
COMMENT ON COLUMN agent_activities.interesting_flag IS '1 if interesting/notable, 0 if routine';
COMMENT ON COLUMN agent_activities.status IS 'Activity status: success, failed, pending, skipped';
COMMENT ON COLUMN agent_activities.error_message IS 'Error details if status=failed';
COMMENT ON COLUMN agent_activities.duration_ms IS 'Duration of action execution in milliseconds';
COMMENT ON COLUMN agent_activities.conversation_id IS 'Link to conversation if part of chat flow';
COMMENT ON COLUMN agent_activities.run_id IS 'Groups related activities into a single run';
COMMENT ON COLUMN agent_activities.metadata IS 'Additional context (source, triggers, etc.)';
COMMENT ON COLUMN agent_activities.created_at IS 'Unix timestamp (milliseconds) when record was created';
