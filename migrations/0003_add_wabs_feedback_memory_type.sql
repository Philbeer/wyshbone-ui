/**
 * Add 'wabs_feedback' to agent_memory memory_type constraint
 * Required for Phase 3 WABS feedback storage
 */

-- Drop the old constraint
ALTER TABLE agent_memory
  DROP CONSTRAINT IF EXISTS agent_memory_memory_type_check;

-- Add new constraint with 'wabs_feedback' included
ALTER TABLE agent_memory
  ADD CONSTRAINT agent_memory_memory_type_check
  CHECK (memory_type IN (
    'preference',      -- User preference or habit
    'success_pattern', -- Successful approach or strategy
    'failure_pattern', -- Failed approach to avoid
    'insight',         -- General insight or learning
    'context',         -- Environmental context
    'wabs_feedback'    -- WABS scoring feedback for weight calibration
  ));
