-- Create delivery_bases table for route planning
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

-- Create indexes
CREATE INDEX IF NOT EXISTS delivery_bases_workspace_id_idx ON delivery_bases(workspace_id);
CREATE INDEX IF NOT EXISTS delivery_bases_is_default_idx ON delivery_bases(is_default);
