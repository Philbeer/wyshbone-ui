-- ============================================================================
-- WYSHBONE BREWCRM SCHEMA FIX MIGRATION
-- Generated: 2025-12-29
-- Purpose: Fix brewery-specific tables to match shared/schema.ts
-- ============================================================================
--
-- HOW TO RUN:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Paste this entire file
-- 3. Click "Run" (or press Ctrl+Enter)
-- 4. Verify no errors in output
--
-- Run this AFTER 2025_12_29_crm_schema_fix.sql
--
-- ============================================================================

-- ============================================================================
-- PART 1: BREW PRODUCTS - Add missing pricing columns
-- ============================================================================

-- Add default pricing columns (missing from original migration)
ALTER TABLE brew_products ADD COLUMN IF NOT EXISTS default_unit_price_ex_vat INTEGER DEFAULT 0;
ALTER TABLE brew_products ADD COLUMN IF NOT EXISTS default_vat_rate INTEGER DEFAULT 2000;

-- Ensure base table exists (if completely missing)
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
  default_unit_price_ex_vat INTEGER DEFAULT 0,
  default_vat_rate INTEGER DEFAULT 2000,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_products_workspace_id_idx ON brew_products(workspace_id);
CREATE INDEX IF NOT EXISTS brew_products_sku_idx ON brew_products(sku);
CREATE INDEX IF NOT EXISTS brew_products_is_active_idx ON brew_products(is_active);

-- ============================================================================
-- PART 2: BREW BATCHES - Ensure table exists
-- ============================================================================

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

-- ============================================================================
-- PART 3: BREW INVENTORY ITEMS - Ensure table exists
-- ============================================================================

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

-- ============================================================================
-- PART 4: BREW CONTAINERS - Ensure table exists
-- ============================================================================

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

-- ============================================================================
-- PART 5: BREW DUTY REPORTS - Ensure table exists
-- ============================================================================

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

-- ============================================================================
-- PART 6: BREW SETTINGS - Ensure table exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS brew_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  default_warehouse_location TEXT,
  default_duty_rate_per_litre INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS brew_settings_workspace_id_idx ON brew_settings(workspace_id);

-- ============================================================================
-- PART 7: BREW DUTY LOOKUP BANDS - Ensure table exists
-- (This is critical for duty calculations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS brew_duty_lookup_bands (
  id TEXT PRIMARY KEY,
  regime TEXT NOT NULL DEFAULT 'UK',
  duty_category_key TEXT NOT NULL,
  threshold_hl INTEGER NOT NULL DEFAULT 0,
  m REAL NOT NULL,
  c REAL NOT NULL,
  base_rate_per_hl REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT
);

CREATE INDEX IF NOT EXISTS brew_duty_lookup_bands_regime_idx ON brew_duty_lookup_bands(regime);
CREATE INDEX IF NOT EXISTS brew_duty_lookup_bands_category_idx ON brew_duty_lookup_bands(duty_category_key);
CREATE INDEX IF NOT EXISTS brew_duty_lookup_bands_lookup_idx 
  ON brew_duty_lookup_bands (duty_category_key, regime, threshold_hl DESC);
CREATE INDEX IF NOT EXISTS brew_duty_lookup_bands_effective_idx 
  ON brew_duty_lookup_bands (effective_from, effective_to);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check brew_products has new pricing columns:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'brew_products' AND column_name IN (
--   'default_unit_price_ex_vat', 'default_vat_rate'
-- );

-- Check brew_duty_lookup_bands exists:
-- SELECT COUNT(*) FROM brew_duty_lookup_bands;

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================

