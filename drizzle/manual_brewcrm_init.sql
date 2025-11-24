-- ============================================================
-- Manual CRM & BrewCRM Schema Initialization
-- Generated from shared/schema.ts definitions
-- Run this SQL manually in Supabase to create all CRM tables
-- ============================================================

-- 1. LeadGen Plans Table (for plan persistence)
CREATE TABLE IF NOT EXISTS lead_gen_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  conversation_id TEXT,
  goal TEXT NOT NULL,
  steps JSONB NOT NULL,
  status TEXT NOT NULL,
  supervisor_task_id TEXT,
  tool_metadata JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS lead_gen_plans_user_id_idx ON lead_gen_plans(user_id);
CREATE INDEX IF NOT EXISTS lead_gen_plans_session_id_idx ON lead_gen_plans(session_id);
CREATE INDEX IF NOT EXISTS lead_gen_plans_status_idx ON lead_gen_plans(status);

-- ============================================================
-- CORE CRM TABLES (Generic, all verticals)
-- ============================================================

-- 2. CRM Settings (Multi-vertical configuration)
CREATE TABLE IF NOT EXISTS crm_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  industry_vertical TEXT NOT NULL DEFAULT 'generic',
  default_country TEXT NOT NULL DEFAULT 'United Kingdom',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_settings_workspace_id_idx ON crm_settings(workspace_id);

-- 3. CRM Customers (Shared across all verticals)
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

-- 4. CRM Delivery Runs
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

-- 5. CRM Orders
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
  total_amount INTEGER,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_orders_workspace_id_idx ON crm_orders(workspace_id);
CREATE INDEX IF NOT EXISTS crm_orders_customer_id_idx ON crm_orders(customer_id);
CREATE INDEX IF NOT EXISTS crm_orders_delivery_run_id_idx ON crm_orders(delivery_run_id);
CREATE INDEX IF NOT EXISTS crm_orders_status_idx ON crm_orders(status);
CREATE INDEX IF NOT EXISTS crm_orders_order_date_idx ON crm_orders(order_date);

-- 6. CRM Order Lines
CREATE TABLE IF NOT EXISTS crm_order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  generic_item_name TEXT NOT NULL,
  generic_item_code TEXT,
  quantity_units INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  vertical_type TEXT,
  vertical_ref_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_order_lines_order_id_idx ON crm_order_lines(order_id);
CREATE INDEX IF NOT EXISTS crm_order_lines_vertical_ref_id_idx ON crm_order_lines(vertical_ref_id);

-- ============================================================
-- BREWERY VERTICAL TABLES (industry_vertical = 'brewery')
-- ============================================================

-- 7. Brewery Products (Beers)
CREATE TABLE IF NOT EXISTS brew_products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  style TEXT,
  sku TEXT,
  abv INTEGER NOT NULL,
  default_package_type TEXT NOT NULL,
  default_package_size_litres INTEGER NOT NULL,
  duty_band TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_products_workspace_id_idx ON brew_products(workspace_id);
CREATE INDEX IF NOT EXISTS brew_products_sku_idx ON brew_products(sku);
CREATE INDEX IF NOT EXISTS brew_products_is_active_idx ON brew_products(is_active);

-- 8. Brewery Batches
CREATE TABLE IF NOT EXISTS brew_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_code TEXT NOT NULL,
  brew_date BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  planned_volume_litres INTEGER NOT NULL,
  actual_volume_litres INTEGER,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_batches_workspace_id_idx ON brew_batches(workspace_id);
CREATE INDEX IF NOT EXISTS brew_batches_product_id_idx ON brew_batches(product_id);
CREATE INDEX IF NOT EXISTS brew_batches_status_idx ON brew_batches(status);
CREATE INDEX IF NOT EXISTS brew_batches_batch_code_idx ON brew_batches(batch_code);

-- 9. Brewery Inventory Items
CREATE TABLE IF NOT EXISTS brew_inventory_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_id TEXT,
  package_type TEXT NOT NULL,
  package_size_litres INTEGER NOT NULL,
  quantity_units INTEGER NOT NULL,
  location TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_inventory_items_workspace_id_idx ON brew_inventory_items(workspace_id);
CREATE INDEX IF NOT EXISTS brew_inventory_items_product_id_idx ON brew_inventory_items(product_id);
CREATE INDEX IF NOT EXISTS brew_inventory_items_batch_id_idx ON brew_inventory_items(batch_id);
CREATE INDEX IF NOT EXISTS brew_inventory_items_location_idx ON brew_inventory_items(location);

-- 10. Brewery Containers (Cask/Keg Tracking)
CREATE TABLE IF NOT EXISTS brew_containers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  container_code TEXT NOT NULL,
  container_type TEXT NOT NULL,
  volume_litres INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'at_brewery',
  last_customer_id TEXT,
  last_outbound_date BIGINT,
  last_return_date BIGINT,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_containers_workspace_id_idx ON brew_containers(workspace_id);
CREATE INDEX IF NOT EXISTS brew_containers_container_code_idx ON brew_containers(container_code);
CREATE INDEX IF NOT EXISTS brew_containers_status_idx ON brew_containers(status);
CREATE INDEX IF NOT EXISTS brew_containers_last_customer_id_idx ON brew_containers(last_customer_id);

-- 11. Brewery Duty Reports
CREATE TABLE IF NOT EXISTS brew_duty_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  period_start BIGINT NOT NULL,
  period_end BIGINT NOT NULL,
  total_litres INTEGER NOT NULL,
  total_duty_amount INTEGER NOT NULL,
  breakdown_json JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_duty_reports_workspace_id_idx ON brew_duty_reports(workspace_id);
CREATE INDEX IF NOT EXISTS brew_duty_reports_period_start_idx ON brew_duty_reports(period_start);

-- 12. Brewery Settings
CREATE TABLE IF NOT EXISTS brew_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  default_warehouse_location TEXT,
  default_duty_rate_per_litre INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_settings_workspace_id_idx ON brew_settings(workspace_id);

-- ============================================================
-- Summary:
-- - 1 LeadGen table (lead_gen_plans)
-- - 5 Core CRM tables (crm_settings, crm_customers, crm_orders, crm_order_lines, crm_delivery_runs)
-- - 6 Brewery vertical tables (brew_products, brew_batches, brew_inventory_items, brew_containers, brew_duty_reports, brew_settings)
-- - Total: 12 new tables with appropriate indexes
-- ============================================================
