-- Migration: Add Price Books System for BrewCRM
-- Date: 2024-12-30
-- Purpose: Enables customer-specific pricing with multiple pricing tiers (Trade, Retail, Wholesale, etc.)

-- ============================================
-- PRICE BOOKS TABLE
-- ============================================
-- Price books allow different pricing tiers for different customer types
CREATE TABLE IF NOT EXISTS brew_price_books (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default INTEGER DEFAULT 0, -- 1 = default price book for workspace
  parent_price_book_id INTEGER REFERENCES brew_price_books(id) ON DELETE SET NULL,
  discount_type VARCHAR(20), -- 'percentage' or 'fixed' (only used if parent_price_book_id is set)
  discount_value INTEGER, -- stored in basis points for percentage (1000 = 10%) or pence for fixed
  is_active INTEGER DEFAULT 1, -- 1 = active, 0 = inactive
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_brew_price_books_workspace ON brew_price_books(workspace_id);
CREATE INDEX IF NOT EXISTS idx_brew_price_books_parent ON brew_price_books(parent_price_book_id);
CREATE INDEX IF NOT EXISTS idx_brew_price_books_default ON brew_price_books(workspace_id, is_default);

-- ============================================
-- PRODUCT PRICES PER PRICE BOOK
-- ============================================
-- Stores specific prices for each product in each price book
CREATE TABLE IF NOT EXISTS brew_product_prices (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL, -- References brew_products.id (TEXT type)
  price_book_id INTEGER NOT NULL REFERENCES brew_price_books(id) ON DELETE CASCADE,
  price INTEGER NOT NULL, -- Price in pence/cents
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(product_id, price_book_id)
);

CREATE INDEX IF NOT EXISTS idx_brew_product_prices_workspace ON brew_product_prices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_brew_product_prices_product ON brew_product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_brew_product_prices_book ON brew_product_prices(price_book_id);

-- ============================================
-- QUANTITY-BASED DISCOUNT BANDS (Advanced Feature)
-- ============================================
-- Allows quantity-based discounts that apply at order time
CREATE TABLE IF NOT EXISTS brew_price_bands (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  price_book_id INTEGER NOT NULL REFERENCES brew_price_books(id) ON DELETE CASCADE,
  product_id TEXT, -- NULL = applies to all products in the price book
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER, -- NULL = no upper limit
  discount_type VARCHAR(20) NOT NULL, -- 'percentage' or 'fixed'
  discount_value INTEGER NOT NULL, -- basis points for percentage, pence for fixed
  created_at BIGINT NOT NULL,
  CONSTRAINT check_quantity_range CHECK (max_quantity IS NULL OR max_quantity > min_quantity)
);

CREATE INDEX IF NOT EXISTS idx_brew_price_bands_workspace ON brew_price_bands(workspace_id);
CREATE INDEX IF NOT EXISTS idx_brew_price_bands_book ON brew_price_bands(price_book_id);
CREATE INDEX IF NOT EXISTS idx_brew_price_bands_product ON brew_price_bands(product_id);

-- ============================================
-- ADD PRICE BOOK ASSIGNMENT TO CUSTOMERS
-- ============================================
-- Add price_book_id column to crm_customers if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'crm_customers' AND column_name = 'price_book_id'
  ) THEN
    ALTER TABLE crm_customers ADD COLUMN price_book_id INTEGER REFERENCES brew_price_books(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_customers_price_book ON crm_customers(price_book_id);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE brew_price_books IS 'Price books allow different pricing tiers (Trade, Retail, Wholesale, etc.)';
COMMENT ON COLUMN brew_price_books.parent_price_book_id IS 'If set, this is a discount book that derives prices from the parent book';
COMMENT ON COLUMN brew_price_books.discount_type IS 'Used only if parent_price_book_id is set - percentage or fixed discount from parent';
COMMENT ON COLUMN brew_price_books.discount_value IS 'Discount amount: basis points for percentage (1000=10%), pence for fixed';
COMMENT ON TABLE brew_product_prices IS 'Stores the specific price for each product in each price book';
COMMENT ON TABLE brew_price_bands IS 'Quantity-based discounts that apply at order time based on order quantity';

