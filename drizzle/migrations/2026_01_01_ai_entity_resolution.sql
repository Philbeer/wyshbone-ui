-- ============================================================
-- AI ENTITY RESOLUTION SYSTEM MIGRATION
-- Date: 2026-01-01
-- Purpose: Master pub database with multi-source entity linking,
--          AI-powered deduplication, and Xero order sync
-- ============================================================

-- ============================================================
-- ENABLE REQUIRED EXTENSIONS
-- ============================================================

-- Enable pg_trgm for fuzzy text matching (name similarity)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- TABLE 1: PUBS_MASTER
-- The golden record for each pub entity, combining data from
-- multiple sources (spreadsheets, Xero, Google Places, manual entry)
-- ============================================================

CREATE TABLE IF NOT EXISTS pubs_master (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  
  -- Core identity
  name VARCHAR(255) NOT NULL,
  
  -- Address fields
  address_line_1 VARCHAR(255),
  address_line_2 VARCHAR(255),
  city VARCHAR(100),
  postcode VARCHAR(20),
  phone VARCHAR(50),
  email VARCHAR(255),
  country VARCHAR(100) DEFAULT 'GB',
  
  -- Geolocation
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Pub attributes
  is_freehouse BOOLEAN,
  pub_company VARCHAR(255),
  
  -- Customer status
  is_customer BOOLEAN DEFAULT false,
  is_closed BOOLEAN DEFAULT false,
  
  -- CRM fields
  last_contacted_at TIMESTAMP,
  last_order_at TIMESTAMP,
  total_orders INTEGER DEFAULT 0,
  customer_since DATE,
  
  -- Lead scoring
  lead_score INTEGER,
  lead_priority VARCHAR(50),
  
  -- Data quality
  data_quality_score FLOAT,
  last_verified_at TIMESTAMP,
  
  -- Discovery tracking
  discovered_by VARCHAR(50),
  discovered_at TIMESTAMP,
  
  -- Full-text search
  search_vector tsvector,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE 2: ENTITY_SOURCES
-- Links each pub to its source records, tracking which systems
-- the data came from and how confident we are in the match
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_sources (
  id SERIAL PRIMARY KEY,
  pub_id INTEGER NOT NULL REFERENCES pubs_master(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL,
  
  -- Source identification
  source_type VARCHAR(50) NOT NULL, -- 'spreadsheet', 'xero', 'google_places', 'manual'
  source_id VARCHAR(255),           -- External ID in the source system
  source_data JSONB NOT NULL,       -- Raw data snapshot from source
  
  -- Match quality
  confidence FLOAT NOT NULL DEFAULT 1.0,  -- 0.0 to 1.0 match confidence
  matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  matched_by VARCHAR(50),           -- 'ai', 'user', 'exact_match', 'fuzzy'
  matched_reasoning TEXT,           -- AI explanation for the match decision
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE 3: XERO_ORDERS
-- Orders imported from Xero, linked to the master pub record
-- for unified order history across systems
-- ============================================================

CREATE TABLE IF NOT EXISTS xero_orders (
  id SERIAL PRIMARY KEY,
  pub_id INTEGER NOT NULL REFERENCES pubs_master(id) ON DELETE CASCADE,
  
  -- Xero identifiers
  xero_invoice_id VARCHAR(255) UNIQUE NOT NULL,
  xero_invoice_number VARCHAR(100),
  
  -- Order details
  order_date DATE NOT NULL,
  due_date DATE,
  total_amount DECIMAL(10,2),
  paid_amount DECIMAL(10,2),
  status VARCHAR(50),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES: PUBS_MASTER
-- ============================================================

-- Postcode lookup for geographic searches
CREATE INDEX IF NOT EXISTS idx_pubs_postcode ON pubs_master(postcode);

-- Trigram index for fuzzy name matching (requires pg_trgm)
CREATE INDEX IF NOT EXISTS idx_pubs_name_trgm ON pubs_master USING gin(name gin_trgm_ops);

-- Partial index for active customers only
CREATE INDEX IF NOT EXISTS idx_pubs_customer ON pubs_master(is_customer) WHERE is_customer = true;

-- Partial index for freehouses (common sales filter)
CREATE INDEX IF NOT EXISTS idx_pubs_freehouse ON pubs_master(is_freehouse) WHERE is_freehouse = true;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_pubs_search ON pubs_master USING gin(search_vector);

-- Data verification tracking
CREATE INDEX IF NOT EXISTS idx_pubs_verified ON pubs_master(last_verified_at);

-- Workspace filtering
CREATE INDEX IF NOT EXISTS idx_pubs_workspace ON pubs_master(workspace_id);

-- ============================================================
-- INDEXES: ENTITY_SOURCES
-- ============================================================

-- Fast lookup by pub
CREATE INDEX IF NOT EXISTS idx_entity_sources_pub ON entity_sources(pub_id);

-- Composite index for finding existing source records
CREATE INDEX IF NOT EXISTS idx_entity_sources_lookup ON entity_sources(source_type, source_id);

-- Workspace filtering
CREATE INDEX IF NOT EXISTS idx_entity_sources_workspace ON entity_sources(workspace_id);

-- ============================================================
-- INDEXES: XERO_ORDERS
-- ============================================================

-- Fast lookup by pub for order history
CREATE INDEX IF NOT EXISTS idx_xero_orders_pub ON xero_orders(pub_id);

-- Orders sorted by date (most recent first)
CREATE INDEX IF NOT EXISTS idx_xero_orders_date ON xero_orders(order_date DESC);

-- ============================================================
-- TABLE COMMENTS
-- ============================================================

COMMENT ON TABLE pubs_master IS 'Golden record for each pub entity. Combines and deduplicates data from multiple sources (spreadsheets, Xero, Google Places, manual entry) into a single authoritative record per pub.';

COMMENT ON TABLE entity_sources IS 'Links master pub records to their source data. Each row represents one data source that contributed to a pub record, with confidence scores and AI reasoning for non-obvious matches.';

COMMENT ON TABLE xero_orders IS 'Historical orders imported from Xero, linked to master pub records. Enables unified order history regardless of how the customer was originally created.';

-- ============================================================
-- COLUMN COMMENTS: PUBS_MASTER
-- ============================================================

COMMENT ON COLUMN pubs_master.workspace_id IS 'Tenant isolation - each brewery has their own pub database';
COMMENT ON COLUMN pubs_master.is_freehouse IS 'True if pub is independently owned (not tied to a pub company), a key sales target indicator';
COMMENT ON COLUMN pubs_master.pub_company IS 'Name of the pub company/chain if not a freehouse (e.g., Greene King, Stonegate)';
COMMENT ON COLUMN pubs_master.lead_score IS 'AI-calculated score 0-100 indicating likelihood to become a customer';
COMMENT ON COLUMN pubs_master.lead_priority IS 'Sales priority tier: hot, warm, cold, nurture, unqualified';
COMMENT ON COLUMN pubs_master.data_quality_score IS 'Score 0-1 indicating completeness and freshness of pub data';
COMMENT ON COLUMN pubs_master.discovered_by IS 'How this pub was discovered: import, google_places, manual, referral';
COMMENT ON COLUMN pubs_master.search_vector IS 'PostgreSQL tsvector for full-text search across name, address, etc.';

-- ============================================================
-- COLUMN COMMENTS: ENTITY_SOURCES
-- ============================================================

COMMENT ON COLUMN entity_sources.source_type IS 'Type of source: spreadsheet, xero, google_places, manual';
COMMENT ON COLUMN entity_sources.source_id IS 'Unique identifier in the source system (e.g., Xero ContactID)';
COMMENT ON COLUMN entity_sources.source_data IS 'Complete snapshot of the original source record as JSONB';
COMMENT ON COLUMN entity_sources.confidence IS 'Match confidence 0.0-1.0. Exact matches are 1.0, AI fuzzy matches may be lower';
COMMENT ON COLUMN entity_sources.matched_by IS 'Who/what made the match: ai, user, exact_match, fuzzy, postcode_name';
COMMENT ON COLUMN entity_sources.matched_reasoning IS 'AI explanation for why this source was matched to this pub (for audit/review)';

-- ============================================================
-- COLUMN COMMENTS: XERO_ORDERS
-- ============================================================

COMMENT ON COLUMN xero_orders.xero_invoice_id IS 'Xero InvoiceID (GUID) - unique identifier for sync';
COMMENT ON COLUMN xero_orders.xero_invoice_number IS 'Human-readable invoice number (e.g., INV-0001)';
COMMENT ON COLUMN xero_orders.status IS 'Xero invoice status: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED';
COMMENT ON COLUMN xero_orders.synced_at IS 'Last time this record was synced from Xero';


