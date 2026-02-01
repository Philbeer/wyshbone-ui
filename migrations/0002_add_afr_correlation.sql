-- Migration: Add AFR Correlation & Decision Tracking fields
-- Purpose: Enable idempotency and unified timeline view in AFR

-- Add correlation columns to deep_research_runs
ALTER TABLE deep_research_runs 
ADD COLUMN IF NOT EXISTS client_request_id TEXT,
ADD COLUMN IF NOT EXISTS router_decision TEXT,
ADD COLUMN IF NOT EXISTS router_reason TEXT,
ADD COLUMN IF NOT EXISTS conversation_id TEXT;

-- Add correlation columns to agent_activities
ALTER TABLE agent_activities 
ADD COLUMN IF NOT EXISTS client_request_id TEXT,
ADD COLUMN IF NOT EXISTS router_decision TEXT,
ADD COLUMN IF NOT EXISTS router_reason TEXT,
ADD COLUMN IF NOT EXISTS parent_activity_id TEXT;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS deep_research_runs_client_request_id_idx ON deep_research_runs(client_request_id);
CREATE INDEX IF NOT EXISTS deep_research_runs_conversation_id_idx ON deep_research_runs(conversation_id);
CREATE INDEX IF NOT EXISTS agent_activities_client_request_id_idx ON agent_activities(client_request_id);
CREATE INDEX IF NOT EXISTS agent_activities_parent_id_idx ON agent_activities(parent_activity_id);

-- Create unique constraint for idempotency (user + client_request_id + run_kind)
-- Note: We use a partial unique index to allow NULLs
CREATE UNIQUE INDEX IF NOT EXISTS deep_research_runs_idempotency_idx 
ON deep_research_runs(user_id, client_request_id) 
WHERE client_request_id IS NOT NULL;
