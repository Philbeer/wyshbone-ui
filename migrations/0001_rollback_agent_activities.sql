-- Rollback: Drop agent_activities table
-- Created: 2026-01-04
-- Purpose: Rollback the agent_activities table creation

-- Drop indexes first (PostgreSQL will drop them automatically with the table, but being explicit)
DROP INDEX IF EXISTS agent_activities_conversation_id_idx;
DROP INDEX IF EXISTS agent_activities_run_id_idx;
DROP INDEX IF EXISTS agent_activities_status_idx;
DROP INDEX IF EXISTS agent_activities_interesting_flag_idx;
DROP INDEX IF EXISTS agent_activities_user_id_timestamp_idx;

-- Drop the table
DROP TABLE IF EXISTS agent_activities;

-- Confirmation message (will only show in psql client)
DO $$
BEGIN
  RAISE NOTICE 'agent_activities table and all indexes have been dropped';
END $$;
