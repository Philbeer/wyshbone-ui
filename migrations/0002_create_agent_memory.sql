/**
 * Agent Memory Schema
 * Stores agent learnings, user preferences, and past outcomes
 */

CREATE TABLE IF NOT EXISTS agent_memory (
  -- Primary identification
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Memory classification
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'preference',      -- User preference or habit
    'success_pattern', -- Successful approach or strategy
    'failure_pattern', -- Failed approach to avoid
    'insight',         -- General insight or learning
    'context'          -- Environmental context
  )),

  -- Memory content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',

  -- Associated data
  related_task_ids TEXT[] DEFAULT '{}',
  related_conversation_id TEXT,

  -- Memory strength and relevance
  confidence_score REAL NOT NULL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  relevance_score REAL NOT NULL DEFAULT 0.5 CHECK (relevance_score BETWEEN 0 AND 1),
  access_count INTEGER NOT NULL DEFAULT 0,

  -- Temporal data
  created_at BIGINT NOT NULL,
  last_accessed_at BIGINT,
  expires_at BIGINT,  -- NULL means no expiry

  -- Memory metadata
  source TEXT NOT NULL CHECK (source IN (
    'task_success',
    'task_failure',
    'user_feedback',
    'pattern_detection',
    'manual_entry'
  )),
  metadata JSONB DEFAULT '{}',

  -- Deprecation tracking
  is_deprecated BOOLEAN DEFAULT FALSE,
  deprecated_at BIGINT,
  deprecated_reason TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_id
  ON agent_memory(user_id);

CREATE INDEX IF NOT EXISTS idx_agent_memory_type
  ON agent_memory(memory_type);

CREATE INDEX IF NOT EXISTS idx_agent_memory_active
  ON agent_memory(user_id, is_deprecated, expires_at)
  WHERE is_deprecated = FALSE;

CREATE INDEX IF NOT EXISTS idx_agent_memory_tags
  ON agent_memory USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_agent_memory_confidence
  ON agent_memory(confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memory_relevance
  ON agent_memory(relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memory_created
  ON agent_memory(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memory_accessed
  ON agent_memory(last_accessed_at DESC);

-- Comments
COMMENT ON TABLE agent_memory IS 'Stores agent learnings, preferences, and patterns for improved decision-making';
COMMENT ON COLUMN agent_memory.confidence_score IS 'How confident we are in this memory (0-1)';
COMMENT ON COLUMN agent_memory.relevance_score IS 'How relevant this memory is currently (0-1)';
COMMENT ON COLUMN agent_memory.access_count IS 'Number of times this memory has been retrieved';
COMMENT ON COLUMN agent_memory.expires_at IS 'When this memory becomes stale (NULL = never expires)';
