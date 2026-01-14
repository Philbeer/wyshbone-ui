-- Migration: Add CRM Call Diary Table
-- Date: 2024-12-30
-- Purpose: Adds sales diary functionality for scheduling and tracking customer/lead calls

-- Create the call diary table
CREATE TABLE IF NOT EXISTS crm_call_diary (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('customer', 'lead')),
  entity_id TEXT NOT NULL,
  scheduled_date TIMESTAMP NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_date TIMESTAMP,
  notes TEXT,
  outcome VARCHAR(50), -- e.g., 'connected', 'voicemail', 'no-answer', 'rescheduled'
  created_at BIGINT NOT NULL,
  created_by TEXT,
  updated_at BIGINT NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_call_diary_workspace ON crm_call_diary(workspace_id);
CREATE INDEX IF NOT EXISTS idx_call_diary_scheduled ON crm_call_diary(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_call_diary_entity ON crm_call_diary(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_call_diary_completed ON crm_call_diary(completed);

-- Composite index for common filter queries
CREATE INDEX IF NOT EXISTS idx_call_diary_workspace_scheduled ON crm_call_diary(workspace_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_call_diary_workspace_completed ON crm_call_diary(workspace_id, completed, scheduled_date);

