-- ============================================
-- WYSHBONE SUPERVISOR INTEGRATION
-- Supabase SQL Migration Script
-- ============================================
-- Run this in your Supabase SQL Editor to add
-- Supervisor integration tables and columns
-- ============================================

-- Step 1: Add source and metadata columns to messages table (if not exists)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ui',
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add index on source column for fast Supervisor message queries
CREATE INDEX IF NOT EXISTS messages_source_idx ON messages(source);

COMMENT ON COLUMN messages.source IS 'Message source: ui, supervisor, or system';
COMMENT ON COLUMN messages.metadata IS 'Additional data for Supervisor messages: { supervisor_task_id, capabilities[], lead_ids[] }';

-- Step 2: Create supervisor_tasks table
CREATE TABLE IF NOT EXISTS supervisor_tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('generate_leads', 'analyze_conversation', 'provide_insights')),
  request_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at BIGINT NOT NULL
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS supervisor_tasks_conversation_id_idx ON supervisor_tasks(conversation_id);
CREATE INDEX IF NOT EXISTS supervisor_tasks_status_idx ON supervisor_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS supervisor_tasks_user_id_idx ON supervisor_tasks(user_id);

COMMENT ON TABLE supervisor_tasks IS 'Tasks for external Supervisor backend to process';
COMMENT ON COLUMN supervisor_tasks.task_type IS 'Type of task: generate_leads, analyze_conversation, or provide_insights';
COMMENT ON COLUMN supervisor_tasks.request_data IS 'Task request data: { user_message, search_query: { business_type, location } }';

-- Step 3: Enable Realtime for messages table (if not already enabled)
-- This allows the frontend to subscribe to new Supervisor messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================
-- Verification Queries
-- ============================================
-- Run these to verify the migration succeeded:

-- Check messages table structure
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'messages';

-- Check supervisor_tasks table exists
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_name = 'supervisor_tasks';

-- ============================================
-- DONE! Your Supabase is now ready for Supervisor integration
-- ============================================
