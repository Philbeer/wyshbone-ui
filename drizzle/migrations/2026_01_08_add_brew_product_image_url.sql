-- Add image_url column to brew_products table for storing beer label images
-- Date: 2026-01-08
-- Purpose: Store beer label/logo URLs from Untappd imports and other sources

ALTER TABLE brew_products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN brew_products.image_url IS 'URL to beer label/logo image (e.g., from Untappd beer_label)';
