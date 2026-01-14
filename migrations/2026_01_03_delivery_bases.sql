-- Delivery Bases - Starting points for delivery routes (depots, warehouses, breweries)
-- Created: 2026-01-03

CREATE TABLE IF NOT EXISTS delivery_bases (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS delivery_bases_workspace_id_idx ON delivery_bases(workspace_id);
CREATE INDEX IF NOT EXISTS delivery_bases_is_default_idx ON delivery_bases(is_default);

-- Comment
COMMENT ON TABLE delivery_bases IS 'Starting points for delivery routes - depots, warehouses, breweries';

-- Add base references to delivery_routes
ALTER TABLE delivery_routes 
ADD COLUMN IF NOT EXISTS start_base_id INTEGER REFERENCES delivery_bases(id),
ADD COLUMN IF NOT EXISTS end_base_id INTEGER REFERENCES delivery_bases(id);

