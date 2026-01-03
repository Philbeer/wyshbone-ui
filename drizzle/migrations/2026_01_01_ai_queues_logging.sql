-- ============================================================
-- AI QUEUES & LOGGING MIGRATION
-- Date: 2026-01-01
-- Purpose: Background job queues for AI research tasks,
--          human review queue for uncertain matches,
--          and search activity logging for analytics
-- ============================================================

-- ============================================================
-- TABLE 1: AI_RESEARCH_QUEUE
-- Background job queue for AI research tasks on pubs.
-- Tasks like enriching pub data, verifying addresses,
-- finding contact details, checking if still open, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_research_queue (
  id SERIAL PRIMARY KEY,
  pub_id INTEGER NOT NULL REFERENCES pubs_master(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL,
  
  -- Task details
  research_type VARCHAR(50) NOT NULL,  -- 'enrich_contact', 'verify_address', 'check_status', 'find_freehouse', 'get_google_data'
  priority INTEGER DEFAULT 5,           -- 1 = highest, 10 = lowest
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMP,
  error_message TEXT,
  
  -- Results
  result JSONB,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- ============================================================
-- TABLE 2: ENTITY_REVIEW_QUEUE
-- Human review queue for entity matches that the AI is
-- uncertain about. Presents potential duplicates or
-- uncertain matches for user verification.
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_review_queue (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  
  -- The incoming data that needs resolution
  new_pub_data JSONB NOT NULL,
  source_type VARCHAR(50) NOT NULL,   -- 'spreadsheet', 'xero', 'google_places'
  source_id VARCHAR(255),
  
  -- Possible match (if AI found one)
  possible_match_pub_id INTEGER REFERENCES pubs_master(id) ON DELETE CASCADE,
  confidence FLOAT NOT NULL,          -- How confident AI is this is a match
  reasoning TEXT,                     -- AI explanation of why it might be a match
  
  -- Review status
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'reviewed', 'auto_resolved', 'expired'
  reviewed_by INTEGER,                   -- User who reviewed
  reviewed_at TIMESTAMP,
  review_decision VARCHAR(50),           -- 'merge', 'create_new', 'reject', 'skip'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE 3: SEARCH_LOG
-- Logs all pub discovery searches for analytics.
-- Tracks what was searched, what was found, and helps
-- identify gaps in coverage or duplicate effort.
-- ============================================================

CREATE TABLE IF NOT EXISTS search_log (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  
  -- Search details
  search_date DATE NOT NULL,
  search_type VARCHAR(50),       -- 'google_places', 'postcode_area', 'radius', 'import'
  search_area VARCHAR(100),      -- Postcode prefix, city, or lat/lng bounds
  search_term VARCHAR(255),      -- What was searched for (e.g., "pub", "freehouse")
  
  -- Results summary
  results_returned INTEGER,      -- Total results from the search
  new_pubs_added INTEGER,        -- New pubs created in master
  existing_pubs_found INTEGER,   -- Existing pubs matched
  duplicates_skipped INTEGER,    -- Duplicates detected and skipped
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Research queue: Find pending jobs by priority
CREATE INDEX IF NOT EXISTS idx_research_queue_status ON ai_research_queue(status, priority);

-- Research queue: Find jobs for a specific pub
CREATE INDEX IF NOT EXISTS idx_research_queue_pub ON ai_research_queue(pub_id);

-- Research queue: Workspace filtering
CREATE INDEX IF NOT EXISTS idx_research_queue_workspace ON ai_research_queue(workspace_id);

-- Review queue: Find pending reviews
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON entity_review_queue(status);

-- Review queue: Workspace filtering
CREATE INDEX IF NOT EXISTS idx_review_queue_workspace ON entity_review_queue(workspace_id);

-- Review queue: Find reviews for a specific pub match
CREATE INDEX IF NOT EXISTS idx_review_queue_match ON entity_review_queue(possible_match_pub_id);

-- Search log: Analytics queries by workspace and date
CREATE INDEX IF NOT EXISTS idx_search_log_workspace ON search_log(workspace_id, search_date DESC);

-- Search log: Find searches by area
CREATE INDEX IF NOT EXISTS idx_search_log_area ON search_log(search_area);

-- ============================================================
-- TABLE COMMENTS
-- ============================================================

COMMENT ON TABLE ai_research_queue IS 'Background job queue for AI research tasks. Jobs are picked up by workers to enrich pub data, verify addresses, check trading status, find contact details, etc. Failed jobs can be retried up to max_attempts.';

COMMENT ON TABLE entity_review_queue IS 'Human review queue for uncertain entity matches. When the AI finds a possible duplicate but confidence is below threshold, it queues the match for human review. Users can merge, create new, or reject.';

COMMENT ON TABLE search_log IS 'Logs all pub discovery searches for analytics and audit. Tracks coverage of different areas, search efficiency, and helps identify gaps in the database or duplicate search effort.';

-- ============================================================
-- COLUMN COMMENTS: AI_RESEARCH_QUEUE
-- ============================================================

COMMENT ON COLUMN ai_research_queue.research_type IS 'Type of research: enrich_contact, verify_address, check_status, find_freehouse, get_google_data, scrape_website';
COMMENT ON COLUMN ai_research_queue.priority IS 'Job priority 1-10. 1 = urgent/high-value, 5 = normal, 10 = background/low-value';
COMMENT ON COLUMN ai_research_queue.status IS 'Job status: pending, processing, completed, failed, cancelled';
COMMENT ON COLUMN ai_research_queue.attempts IS 'Number of times this job has been attempted';
COMMENT ON COLUMN ai_research_queue.max_attempts IS 'Maximum retry attempts before marking as permanently failed';
COMMENT ON COLUMN ai_research_queue.result IS 'JSON result of the research (new data found, verification results, etc.)';

-- ============================================================
-- COLUMN COMMENTS: ENTITY_REVIEW_QUEUE
-- ============================================================

COMMENT ON COLUMN entity_review_queue.new_pub_data IS 'The incoming pub data that needs to be resolved (from import, Xero sync, etc.)';
COMMENT ON COLUMN entity_review_queue.source_type IS 'Where this data came from: spreadsheet, xero, google_places, manual';
COMMENT ON COLUMN entity_review_queue.possible_match_pub_id IS 'If AI found a possible match, the pub_id it might be a duplicate of';
COMMENT ON COLUMN entity_review_queue.confidence IS 'AI confidence 0-1 that this is a match. Low confidence items go to review queue.';
COMMENT ON COLUMN entity_review_queue.reasoning IS 'AI explanation for the match (e.g., "Same postcode, similar name, different phone number")';
COMMENT ON COLUMN entity_review_queue.review_decision IS 'What the user decided: merge (with existing), create_new (not a duplicate), reject (bad data), skip (decide later)';

-- ============================================================
-- COLUMN COMMENTS: SEARCH_LOG
-- ============================================================

COMMENT ON COLUMN search_log.search_type IS 'Search method: google_places, postcode_area, radius, name_search, import';
COMMENT ON COLUMN search_log.search_area IS 'Area searched: postcode prefix (SW1), city (London), or lat/lng bounding box';
COMMENT ON COLUMN search_log.search_term IS 'Search query used (e.g., "pub", "bar", "freehouse near me")';
COMMENT ON COLUMN search_log.new_pubs_added IS 'Count of new pubs added to pubs_master from this search';
COMMENT ON COLUMN search_log.existing_pubs_found IS 'Count of results that matched existing pubs (good for coverage tracking)';
COMMENT ON COLUMN search_log.duplicates_skipped IS 'Count of results detected as duplicates and not added';








