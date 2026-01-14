-- ============================================================================
-- WYSHBONE CRM SCHEMA FIX MIGRATION
-- Generated: 2025-12-29
-- Purpose: Bring Supabase schema in line with shared/schema.ts
-- ============================================================================
--
-- HOW TO RUN:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Paste this entire file
-- 3. Click "Run" (or press Ctrl+Enter)
-- 4. Verify no errors in output
-- 5. Restart your backend server to pick up changes
--
-- SAFETY:
-- - Uses CREATE TABLE IF NOT EXISTS (won't fail if table exists)
-- - Uses ADD COLUMN IF NOT EXISTS (won't fail if column exists)
-- - Does NOT delete any tables or columns
-- - Preserves all existing data
--
-- ============================================================================

-- ============================================================================
-- PART 1: CRM PRODUCTS TABLE (missing entirely)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  category TEXT,
  unit_type TEXT NOT NULL DEFAULT 'each',
  default_unit_price_ex_vat INTEGER DEFAULT 0,
  default_vat_rate INTEGER DEFAULT 2000,
  is_active INTEGER NOT NULL DEFAULT 1,
  track_stock INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Indexes for crm_products
CREATE INDEX IF NOT EXISTS crm_products_workspace_id_idx ON crm_products(workspace_id);
CREATE INDEX IF NOT EXISTS crm_products_sku_idx ON crm_products(sku);
CREATE INDEX IF NOT EXISTS crm_products_is_active_idx ON crm_products(is_active);
CREATE INDEX IF NOT EXISTS crm_products_category_idx ON crm_products(category);

-- ============================================================================
-- PART 2: CRM STOCK TABLE (missing entirely)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_stock (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Main Warehouse',
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  reorder_quantity INTEGER DEFAULT 0,
  cost_price_per_unit INTEGER DEFAULT 0,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Indexes for crm_stock
CREATE INDEX IF NOT EXISTS crm_stock_workspace_id_idx ON crm_stock(workspace_id);
CREATE INDEX IF NOT EXISTS crm_stock_product_id_idx ON crm_stock(product_id);
CREATE INDEX IF NOT EXISTS crm_stock_location_idx ON crm_stock(location);

-- ============================================================================
-- PART 3: CRM ORDERS - Add missing VAT/discount/shipping/xero columns
-- ============================================================================

-- Subtotal and VAT columns
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS subtotal_ex_vat INTEGER DEFAULT 0;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS vat_total INTEGER DEFAULT 0;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS total_inc_vat INTEGER DEFAULT 0;

-- Discount columns
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none';
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS discount_value INTEGER DEFAULT 0;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0;

-- Shipping columns
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS shipping_ex_vat INTEGER DEFAULT 0;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS shipping_vat_rate INTEGER DEFAULT 2000;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS shipping_vat_amount INTEGER DEFAULT 0;

-- Xero integration columns
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS xero_exported_at BIGINT;

-- ============================================================================
-- PART 4: CRM ORDER LINES - Add new VAT fields alongside legacy fields
-- ============================================================================

-- New schema fields (keeping legacy columns intact)
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS unit_price_ex_vat INTEGER DEFAULT 0;
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS vat_rate INTEGER DEFAULT 0;
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS line_subtotal_ex_vat INTEGER DEFAULT 0;
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS line_vat_amount INTEGER DEFAULT 0;
ALTER TABLE crm_order_lines ADD COLUMN IF NOT EXISTS line_total_inc_vat INTEGER DEFAULT 0;

-- Index for new product_id column
CREATE INDEX IF NOT EXISTS crm_order_lines_product_id_idx ON crm_order_lines(product_id);

-- ============================================================================
-- PART 5: CRM SETTINGS - Ensure table exists with all columns
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  industry_vertical TEXT NOT NULL DEFAULT 'generic',
  default_country TEXT NOT NULL DEFAULT 'United Kingdom',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_settings_workspace_id_idx ON crm_settings(workspace_id);

-- ============================================================================
-- PART 6: CRM CUSTOMERS - Ensure table exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  primary_contact_name TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT NOT NULL DEFAULT 'United Kingdom',
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_customers_workspace_id_idx ON crm_customers(workspace_id);
CREATE INDEX IF NOT EXISTS crm_customers_name_idx ON crm_customers(name);

-- ============================================================================
-- PART 7: CRM DELIVERY RUNS - Ensure table exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_delivery_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  driver_name TEXT,
  vehicle TEXT,
  scheduled_date BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_delivery_runs_workspace_id_idx ON crm_delivery_runs(workspace_id);
CREATE INDEX IF NOT EXISTS crm_delivery_runs_status_idx ON crm_delivery_runs(status);
CREATE INDEX IF NOT EXISTS crm_delivery_runs_scheduled_date_idx ON crm_delivery_runs(scheduled_date);

-- ============================================================================
-- PART 8: CRM ORDERS - Ensure base table exists (if completely missing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  order_date BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  delivery_date BIGINT,
  delivery_run_id TEXT,
  currency TEXT NOT NULL DEFAULT 'GBP',
  subtotal_ex_vat INTEGER DEFAULT 0,
  discount_type TEXT DEFAULT 'none',
  discount_value INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  shipping_ex_vat INTEGER DEFAULT 0,
  shipping_vat_rate INTEGER DEFAULT 2000,
  shipping_vat_amount INTEGER DEFAULT 0,
  vat_total INTEGER DEFAULT 0,
  total_inc_vat INTEGER DEFAULT 0,
  total_amount INTEGER,
  xero_invoice_id TEXT,
  xero_exported_at BIGINT,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_orders_workspace_id_idx ON crm_orders(workspace_id);
CREATE INDEX IF NOT EXISTS crm_orders_customer_id_idx ON crm_orders(customer_id);
CREATE INDEX IF NOT EXISTS crm_orders_delivery_run_id_idx ON crm_orders(delivery_run_id);
CREATE INDEX IF NOT EXISTS crm_orders_status_idx ON crm_orders(status);
CREATE INDEX IF NOT EXISTS crm_orders_order_date_idx ON crm_orders(order_date);

-- ============================================================================
-- PART 9: CRM ORDER LINES - Ensure base table exists (if completely missing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_ex_vat INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 0,
  line_subtotal_ex_vat INTEGER NOT NULL DEFAULT 0,
  line_vat_amount INTEGER NOT NULL DEFAULT 0,
  line_total_inc_vat INTEGER NOT NULL DEFAULT 0,
  -- Legacy columns (kept for backwards compatibility)
  generic_item_name TEXT,
  generic_item_code TEXT,
  quantity_units INTEGER,
  unit_price INTEGER,
  line_total INTEGER,
  vertical_type TEXT,
  vertical_ref_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_order_lines_order_id_idx ON crm_order_lines(order_id);
CREATE INDEX IF NOT EXISTS crm_order_lines_vertical_ref_id_idx ON crm_order_lines(vertical_ref_id);

-- ============================================================================
-- VERIFICATION QUERIES (run these to confirm migration worked)
-- ============================================================================

-- Check crm_products exists with correct columns:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'crm_products' ORDER BY ordinal_position;

-- Check crm_stock exists:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'crm_stock' ORDER BY ordinal_position;

-- Check crm_orders has new columns:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'crm_orders' AND column_name IN (
--   'subtotal_ex_vat', 'vat_total', 'discount_type', 'xero_invoice_id'
-- );

-- Check crm_order_lines has new VAT columns:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'crm_order_lines' AND column_name IN (
--   'product_id', 'unit_price_ex_vat', 'vat_rate', 'line_vat_amount'
-- );

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================

