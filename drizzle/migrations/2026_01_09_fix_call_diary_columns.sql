-- Fix crm_call_diary column types to match code expectations
-- scheduled_date should be BIGINT (Unix timestamp), not TIMESTAMP
-- completed should be INTEGER (0/1), not BOOLEAN

-- Drop default on completed before altering type
ALTER TABLE crm_call_diary ALTER COLUMN completed DROP DEFAULT;

-- Alter column types
ALTER TABLE crm_call_diary
  ALTER COLUMN scheduled_date TYPE BIGINT USING EXTRACT(EPOCH FROM scheduled_date)::BIGINT * 1000,
  ALTER COLUMN completed TYPE INTEGER USING CASE WHEN completed THEN 1 ELSE 0 END,
  ALTER COLUMN completed_date TYPE BIGINT USING CASE WHEN completed_date IS NOT NULL THEN EXTRACT(EPOCH FROM completed_date)::BIGINT * 1000 ELSE NULL END;

-- Add back default as integer
ALTER TABLE crm_call_diary ALTER COLUMN completed SET DEFAULT 0;
