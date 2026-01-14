-- Add isSample flag to CRM tables for onboarding sample data tracking
-- Created: 2026-01-05

-- Add is_sample column to crm_customers
ALTER TABLE crm_customers
ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT false;

-- Add is_sample column to crm_products
ALTER TABLE crm_products
ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT false;

-- Add is_sample column to crm_orders
ALTER TABLE crm_orders
ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT false;

-- Add indexes for efficient sample data filtering
CREATE INDEX IF NOT EXISTS crm_customers_is_sample_idx ON crm_customers(is_sample);
CREATE INDEX IF NOT EXISTS crm_products_is_sample_idx ON crm_products(is_sample);
CREATE INDEX IF NOT EXISTS crm_orders_is_sample_idx ON crm_orders(is_sample);

-- Comments
COMMENT ON COLUMN crm_customers.is_sample IS 'Flag indicating this is sample/demo data for onboarding';
COMMENT ON COLUMN crm_products.is_sample IS 'Flag indicating this is sample/demo data for onboarding';
COMMENT ON COLUMN crm_orders.is_sample IS 'Flag indicating this is sample/demo data for onboarding';
