-- Migration: Add Xero sync fields for products and orders
-- Part 2: Import Orders & Products from Xero

-- ============================================
-- ADD XERO SYNC FIELDS TO BREW_PRODUCTS
-- ============================================

-- Add Xero item tracking fields
ALTER TABLE brew_products
ADD COLUMN IF NOT EXISTS xero_item_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS xero_item_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_xero_sync_at TIMESTAMP;

-- Create unique index on xero_item_id (allows null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_brew_products_xero_item_id 
ON brew_products(xero_item_id) 
WHERE xero_item_id IS NOT NULL;

-- Create index on xero_item_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_brew_products_xero_item_code 
ON brew_products(xero_item_code) 
WHERE xero_item_code IS NOT NULL;

-- ============================================
-- ADD XERO SYNC FIELDS TO CRM_ORDERS
-- ============================================

-- xero_invoice_id already exists, add additional fields
ALTER TABLE crm_orders
ADD COLUMN IF NOT EXISTS xero_invoice_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_xero_sync_at TIMESTAMP;

-- Create unique index on xero_invoice_id (allows null, may already exist as unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_orders_xero_invoice_id 
ON crm_orders(xero_invoice_id) 
WHERE xero_invoice_id IS NOT NULL;

-- Create index on xero_invoice_number for display lookups
CREATE INDEX IF NOT EXISTS idx_crm_orders_xero_invoice_number 
ON crm_orders(xero_invoice_number) 
WHERE xero_invoice_number IS NOT NULL;

-- ============================================
-- ADD XERO ITEM REFERENCE TO ORDER LINES
-- ============================================

ALTER TABLE crm_order_lines
ADD COLUMN IF NOT EXISTS xero_line_item_id VARCHAR(100);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN brew_products.xero_item_id IS 'Xero ItemID for sync tracking - unique per workspace';
COMMENT ON COLUMN brew_products.xero_item_code IS 'Xero Item Code (maps to SKU)';
COMMENT ON COLUMN brew_products.last_xero_sync_at IS 'Last time this product was synced from/to Xero';

COMMENT ON COLUMN crm_orders.xero_invoice_id IS 'Xero InvoiceID for sync tracking';
COMMENT ON COLUMN crm_orders.xero_invoice_number IS 'Xero Invoice Number for display (e.g. INV-0001)';
COMMENT ON COLUMN crm_orders.last_xero_sync_at IS 'Last time this order was synced from/to Xero';

COMMENT ON COLUMN crm_order_lines.xero_line_item_id IS 'Xero LineItemID for sync tracking';

