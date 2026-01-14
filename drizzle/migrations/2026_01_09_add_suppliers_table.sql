-- Create suppliers table for brewery supplier management
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,

  -- Basic Info
  name TEXT NOT NULL,
  supplier_type TEXT, -- brewery_supplier, hop_merchant, maltster, packaging, equipment, services, etc.

  -- Contact
  email TEXT,
  phone TEXT,
  website TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'UK',

  -- Business
  company_number TEXT,
  vat_number TEXT,

  -- Relationship
  is_our_supplier INTEGER DEFAULT 0, -- 1 = true, 0 = false
  first_purchase_date BIGINT,
  last_purchase_date BIGINT,
  total_purchases_amount DOUBLE PRECISION DEFAULT 0, -- In GBP
  purchase_count INTEGER DEFAULT 0,

  -- Intelligence (for supply chain insights)
  other_breweries_count INTEGER DEFAULT 0, -- How many other breweries use this supplier
  trending_score DOUBLE PRECISION DEFAULT 0, -- Popularity/trend indicator

  -- Xero Integration
  xero_contact_id TEXT UNIQUE,
  last_xero_sync_at BIGINT,

  -- Discovery
  discovered_by TEXT, -- 'xero', 'manual', 'ai_sleeper_agent'
  discovered_at BIGINT,

  -- Notes
  notes TEXT,

  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS suppliers_workspace_id_idx ON suppliers(workspace_id);
CREATE INDEX IF NOT EXISTS suppliers_xero_contact_id_idx ON suppliers(xero_contact_id);
CREATE INDEX IF NOT EXISTS suppliers_is_our_supplier_idx ON suppliers(is_our_supplier);
CREATE INDEX IF NOT EXISTS suppliers_supplier_type_idx ON suppliers(supplier_type);
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON suppliers(name);
