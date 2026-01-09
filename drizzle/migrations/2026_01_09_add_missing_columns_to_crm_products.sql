-- ============================================================================
-- Add missing columns to crm_products
-- Date: 2026-01-09
-- Purpose: Add generic CRM fields that were in the old crm_products table
-- ============================================================================

-- Add track_stock column (for inventory tracking in non-brewery verticals)
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS track_stock INTEGER DEFAULT 0;

-- Add is_sample column (for onboarding sample data)
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT false;

-- Add description column (generic product description)
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS description TEXT;

-- Add category column (generic category field)
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS category TEXT;

-- Add unit_type column (e.g., 'each', 'hour', 'kg', 'litre')
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'each';

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS crm_products_category_idx ON crm_products(category);
CREATE INDEX IF NOT EXISTS crm_products_is_sample_idx ON crm_products(is_sample);

-- Add comment
COMMENT ON COLUMN crm_products.track_stock IS '1 = track inventory, 0 = don''t track (for non-brewery verticals)';
COMMENT ON COLUMN crm_products.is_sample IS 'Flag for onboarding sample data that can be safely deleted';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check columns exist:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'crm_products'
-- ORDER BY ordinal_position;
