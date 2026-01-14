-- Create crm_products table (universal products for all verticals)
CREATE TABLE IF NOT EXISTS crm_products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  category TEXT,
  unit_type TEXT DEFAULT 'each',

  -- Brewery-specific fields (nullable)
  style TEXT,
  image_url TEXT,
  abv INTEGER,
  default_package_type TEXT,
  default_package_size_litres INTEGER,
  duty_band TEXT,

  -- Pricing & status
  default_unit_price_ex_vat INTEGER DEFAULT 0,
  default_vat_rate INTEGER DEFAULT 2000,
  is_active INTEGER NOT NULL DEFAULT 1,
  track_stock INTEGER DEFAULT 0,
  is_sample BOOLEAN DEFAULT false,

  -- Xero sync fields
  xero_item_id TEXT,
  xero_item_code TEXT,
  last_xero_sync_at TIMESTAMP,

  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS crm_products_workspace_id_idx ON crm_products(workspace_id);
CREATE INDEX IF NOT EXISTS crm_products_sku_idx ON crm_products(sku);
CREATE INDEX IF NOT EXISTS crm_products_is_active_idx ON crm_products(is_active);
CREATE INDEX IF NOT EXISTS crm_products_category_idx ON crm_products(category);
CREATE INDEX IF NOT EXISTS crm_products_is_sample_idx ON crm_products(is_sample);
CREATE INDEX IF NOT EXISTS crm_products_xero_item_id_idx ON crm_products(xero_item_id);
CREATE INDEX IF NOT EXISTS crm_products_xero_item_code_idx ON crm_products(xero_item_code);
