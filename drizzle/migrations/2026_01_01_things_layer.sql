-- ============================================================
-- THINGS LAYER MIGRATION
-- Date: 2026-01-01
-- Purpose: Events, festivals, and market opportunities discovery
--          plus agent intelligence/learning storage
-- ============================================================

-- ============================================================
-- TABLE 1: THINGS
-- Tracks events, festivals, markets, and other opportunities
-- that the AI agent discovers. Can be linked to a pub or
-- exist as standalone locations (e.g., festival grounds).
-- ============================================================

CREATE TABLE IF NOT EXISTS things (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  
  -- Classification
  thing_type VARCHAR(50) NOT NULL,  -- 'beer_festival', 'farmers_market', 'food_event', 'trade_show', 'pub_event', etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Timing
  start_date DATE,
  end_date DATE,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern VARCHAR(100),  -- 'weekly:saturday', 'monthly:first_sunday', 'annual:march'
  next_occurrence DATE,
  
  -- Location: Either linked to a pub OR standalone
  outlet_id INTEGER REFERENCES pubs_master(id) ON DELETE SET NULL,
  standalone_location VARCHAR(255),  -- Venue name if not a pub
  standalone_address TEXT,
  standalone_postcode VARCHAR(20),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Contact & Details
  url VARCHAR(500),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  ticket_price DECIMAL(10, 2),
  expected_attendance INTEGER,
  organizer VARCHAR(255),
  
  -- Status
  status VARCHAR(50) DEFAULT 'upcoming',  -- 'upcoming', 'ongoing', 'completed', 'cancelled', 'postponed'
  
  -- User engagement tracking
  user_interested BOOLEAN DEFAULT false,
  user_attended BOOLEAN DEFAULT false,
  user_notes TEXT,
  user_rating INTEGER,  -- 1-5 stars
  
  -- Discovery metadata
  discovered_by VARCHAR(50),  -- 'google_events', 'facebook', 'camra', 'manual', 'web_scrape'
  discovered_at TIMESTAMP,
  source_url VARCHAR(500),
  
  -- AI scoring
  relevance_score FLOAT,       -- How relevant to this brewery (0-1)
  lead_potential_score FLOAT,  -- Sales opportunity potential (0-1)
  
  -- Data quality
  last_verified_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE 2: AGENT_INTELLIGENCE
-- Stores learned insights, patterns, and observations that
-- the AI agent discovers while analyzing data. This creates
-- institutional memory that improves over time.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_intelligence (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  
  -- What entity this intelligence relates to
  entity_type VARCHAR(50) NOT NULL,  -- 'pub', 'area', 'product', 'customer_segment', 'general'
  entity_id INTEGER,                  -- FK to specific entity (nullable for area/segment insights)
  
  -- Intelligence classification
  intelligence_type VARCHAR(50) NOT NULL,  -- 'buying_pattern', 'seasonal_trend', 'price_sensitivity', 'preference', 'risk_signal', 'opportunity'
  
  -- The actual insight
  observation TEXT NOT NULL,  -- Human-readable insight: "This pub orders more IPA in summer months"
  data JSONB,                 -- Structured data supporting the observation
  
  -- Confidence and provenance
  confidence FLOAT NOT NULL,  -- 0-1 confidence in this insight
  source VARCHAR(100),        -- 'order_analysis', 'interaction_history', 'market_data', 'user_feedback'
  evidence TEXT,              -- Summary of evidence supporting this insight
  sample_size INTEGER,        -- Number of data points this is based on
  
  -- Usage tracking
  last_used_at TIMESTAMP,     -- When the agent last used this insight
  use_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP        -- Some insights become stale
);

-- ============================================================
-- INDEXES: THINGS
-- ============================================================

-- Workspace isolation
CREATE INDEX IF NOT EXISTS idx_things_workspace ON things(workspace_id);

-- Pub linkage for events at customer venues
CREATE INDEX IF NOT EXISTS idx_things_outlet ON things(outlet_id);

-- Date range queries for calendar views
CREATE INDEX IF NOT EXISTS idx_things_dates ON things(start_date, end_date);

-- Filter by event type
CREATE INDEX IF NOT EXISTS idx_things_type ON things(thing_type);

-- Filter by status
CREATE INDEX IF NOT EXISTS idx_things_status ON things(status);

-- Sort by relevance for prioritized views
CREATE INDEX IF NOT EXISTS idx_things_relevance ON things(relevance_score DESC);

-- Partial index for upcoming events dashboard
CREATE INDEX IF NOT EXISTS idx_things_upcoming ON things(status, start_date) WHERE status = 'upcoming';

-- Full-text search on name and description
CREATE INDEX IF NOT EXISTS idx_things_search ON things USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- ============================================================
-- INDEXES: AGENT_INTELLIGENCE
-- ============================================================

-- Workspace isolation
CREATE INDEX IF NOT EXISTS idx_intelligence_workspace ON agent_intelligence(workspace_id);

-- Look up insights for a specific entity
CREATE INDEX IF NOT EXISTS idx_intelligence_entity ON agent_intelligence(entity_type, entity_id);

-- Filter by intelligence type
CREATE INDEX IF NOT EXISTS idx_intelligence_type ON agent_intelligence(intelligence_type);

-- Sort by confidence for ranking insights
CREATE INDEX IF NOT EXISTS idx_intelligence_confidence ON agent_intelligence(confidence DESC);

-- Find stale insights to refresh or expire
CREATE INDEX IF NOT EXISTS idx_intelligence_expires ON agent_intelligence(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================
-- TABLE COMMENTS
-- ============================================================

COMMENT ON TABLE things IS 'Events, festivals, markets, and opportunities discovered by the AI agent. "Things" that are happening which represent potential sales opportunities. Can be linked to a pub (pub_event) or exist at standalone venues (festival grounds, markets).';

COMMENT ON TABLE agent_intelligence IS 'Learned insights and patterns that the AI agent discovers while analyzing brewery data. Creates institutional memory that improves recommendations and predictions over time. Insights have confidence scores and can expire when they become stale.';

-- ============================================================
-- COLUMN COMMENTS: THINGS
-- ============================================================

COMMENT ON COLUMN things.thing_type IS 'Classification: beer_festival, farmers_market, food_event, trade_show, pub_event, private_function, etc.';
COMMENT ON COLUMN things.outlet_id IS 'Links to pubs_master if this event is at a known pub. NULL for standalone venues.';
COMMENT ON COLUMN things.standalone_location IS 'Venue name when event is not at a known pub (e.g., "Victoria Park", "ExCeL London")';
COMMENT ON COLUMN things.recurrence_pattern IS 'Pattern for recurring events: weekly:saturday, monthly:first_sunday, annual:august';
COMMENT ON COLUMN things.status IS 'Event status: upcoming, ongoing, completed, cancelled, postponed';
COMMENT ON COLUMN things.relevance_score IS 'AI-calculated relevance to this brewery (0-1). Based on event type, location, attendee profile.';
COMMENT ON COLUMN things.lead_potential_score IS 'AI-estimated sales opportunity score (0-1). High for trade events, festivals needing suppliers.';
COMMENT ON COLUMN things.user_interested IS 'User flagged this event as interesting for follow-up';
COMMENT ON COLUMN things.user_attended IS 'User marked they attended this event';
COMMENT ON COLUMN things.discovered_by IS 'Source that found this event: google_events, facebook, camra_whatspub, eventbrite, manual';

-- ============================================================
-- COLUMN COMMENTS: AGENT_INTELLIGENCE
-- ============================================================

COMMENT ON COLUMN agent_intelligence.entity_type IS 'What this insight is about: pub, area, product, customer_segment, general';
COMMENT ON COLUMN agent_intelligence.entity_id IS 'Foreign key to specific entity. NULL for area/segment-level insights.';
COMMENT ON COLUMN agent_intelligence.intelligence_type IS 'Category: buying_pattern, seasonal_trend, price_sensitivity, preference, risk_signal, opportunity, churn_indicator';
COMMENT ON COLUMN agent_intelligence.observation IS 'Human-readable insight. E.g., "This pub orders 50% more cask ale in December"';
COMMENT ON COLUMN agent_intelligence.data IS 'Structured JSON supporting the observation. E.g., {"monthly_volumes": {...}, "peak_month": "december"}';
COMMENT ON COLUMN agent_intelligence.confidence IS 'Confidence score 0-1. Based on sample size, data recency, and consistency.';
COMMENT ON COLUMN agent_intelligence.source IS 'What analysis generated this: order_analysis, interaction_history, market_data, user_feedback';
COMMENT ON COLUMN agent_intelligence.evidence IS 'Summary of supporting evidence for audit/explanation';
COMMENT ON COLUMN agent_intelligence.sample_size IS 'Number of data points this insight is based on. Higher = more reliable.';
COMMENT ON COLUMN agent_intelligence.use_count IS 'How many times the agent has used this insight. High-use insights are more valuable.';
COMMENT ON COLUMN agent_intelligence.expires_at IS 'When this insight becomes stale. Seasonal trends may expire after a year, preferences rarely expire.';








