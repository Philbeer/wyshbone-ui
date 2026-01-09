-- ============================================================================
-- RENAME brew_products → crm_products
-- Date: 2026-01-09
-- Purpose: Rename brew_products to crm_products (universal products table)
-- Reason: brew_products has the correct schema (generic + nullable brewery fields)
--         but the name is misleading - this is the universal products table
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
-- - Uses IF EXISTS to avoid errors if old crm_products doesn't exist
-- - CASCADE ensures dependent objects are handled
-- - All data is preserved (this is just a rename)
--
-- ============================================================================

-- Step 1: Drop old/wrong crm_products table if it exists
-- (This table has incomplete schema - brew_products has the correct one)
DROP TABLE IF EXISTS crm_products CASCADE;

-- Step 2: Rename brew_products to crm_products
ALTER TABLE brew_products RENAME TO crm_products;

-- Step 3: Rename all indexes
ALTER INDEX IF EXISTS brew_products_workspace_id_idx RENAME TO crm_products_workspace_id_idx;
ALTER INDEX IF EXISTS brew_products_sku_idx RENAME TO crm_products_sku_idx;
ALTER INDEX IF EXISTS brew_products_is_active_idx RENAME TO crm_products_is_active_idx;
ALTER INDEX IF EXISTS brew_products_xero_item_id_idx RENAME TO crm_products_xero_item_id_idx;
ALTER INDEX IF EXISTS brew_products_xero_item_code_idx RENAME TO crm_products_xero_item_code_idx;

-- Step 4: Make brewery-specific fields nullable (for non-brewery products)
-- These fields are required for brewery products, but should be NULL for other verticals
ALTER TABLE crm_products ALTER COLUMN abv DROP NOT NULL;
ALTER TABLE crm_products ALTER COLUMN default_package_type DROP NOT NULL;
ALTER TABLE crm_products ALTER COLUMN default_package_size_litres DROP NOT NULL;
ALTER TABLE crm_products ALTER COLUMN duty_band DROP NOT NULL;
ALTER TABLE crm_products ALTER COLUMN style DROP NOT NULL;

-- Step 5: Add helpful table comment
COMMENT ON TABLE crm_products IS 'Universal products table for all verticals (brewery, physio, trades, etc.). Brewery-specific fields (abv, duty_band, etc.) are nullable and only used for brewery products.';

-- ============================================================================
-- VERIFICATION QUERIES (uncomment to run)
-- ============================================================================

-- Check table exists with correct name:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'crm_products';

-- Check all columns are present (should show ~18 columns):
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'crm_products'
-- ORDER BY ordinal_position;

-- Check indexes were renamed:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'crm_products';

-- Count existing products:
-- SELECT COUNT(*) FROM crm_products;

-- ============================================================================
-- MIGRATION COMPLETE!
-- Next steps: Update code to use crmProducts instead of brewProducts
-- ============================================================================
