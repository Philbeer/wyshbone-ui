-- Migration: Add Supplier Management Tables
-- Date: 2026-01-02
-- Description: Add suppliers (who we buy FROM), purchases, and supplier products
--              to enable supply chain intelligence

-- ============= SUPPLIERS TABLE =============
-- Companies/merchants we purchase from (hops, malt, packaging, etc.)
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  
  -- Basic Info
  "name" TEXT NOT NULL,
  "supplier_type" TEXT, -- brewery_supplier, hop_merchant, maltster, packaging, equipment, services
  
  -- Contact
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "address_line_1" TEXT,
  "address_line_2" TEXT,
  "city" TEXT,
  "postcode" TEXT,
  "country" TEXT DEFAULT 'UK',
  
  -- Business
  "company_number" TEXT,
  "vat_number" TEXT,
  
  -- Relationship
  "is_our_supplier" INTEGER DEFAULT 0, -- 1 = true, 0 = false
  "first_purchase_date" BIGINT,
  "last_purchase_date" BIGINT,
  "total_purchases_amount" DOUBLE PRECISION DEFAULT 0,
  "purchase_count" INTEGER DEFAULT 0,
  
  -- Intelligence
  "other_breweries_count" INTEGER DEFAULT 0,
  "trending_score" DOUBLE PRECISION DEFAULT 0,
  
  -- Xero Integration
  "xero_contact_id" TEXT UNIQUE,
  "last_xero_sync_at" BIGINT,
  
  -- Discovery
  "discovered_by" TEXT,
  "discovered_at" BIGINT,
  
  -- Notes
  "notes" TEXT,
  
  "created_at" BIGINT NOT NULL,
  "updated_at" BIGINT NOT NULL
);

-- Indexes for suppliers
CREATE INDEX IF NOT EXISTS "suppliers_workspace_id_idx" ON "suppliers" ("workspace_id");
CREATE INDEX IF NOT EXISTS "suppliers_xero_contact_id_idx" ON "suppliers" ("xero_contact_id");
CREATE INDEX IF NOT EXISTS "suppliers_is_our_supplier_idx" ON "suppliers" ("is_our_supplier");
CREATE INDEX IF NOT EXISTS "suppliers_supplier_type_idx" ON "suppliers" ("supplier_type");
CREATE INDEX IF NOT EXISTS "suppliers_name_idx" ON "suppliers" ("name");


-- ============= SUPPLIER PURCHASES TABLE =============
-- Bills/invoices we receive from suppliers
CREATE TABLE IF NOT EXISTS "supplier_purchases" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL REFERENCES "suppliers"("id"),
  
  -- Xero
  "xero_bill_id" TEXT UNIQUE,
  "xero_bill_number" TEXT,
  
  -- Purchase
  "purchase_date" BIGINT NOT NULL,
  "due_date" BIGINT,
  "total_amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT DEFAULT 'GBP',
  "status" TEXT DEFAULT 'draft', -- draft, submitted, authorised, paid, voided
  
  -- Items
  "line_items" JSONB,
  
  -- Notes
  "reference" TEXT,
  "notes" TEXT,
  
  "created_at" BIGINT NOT NULL,
  "updated_at" BIGINT NOT NULL,
  "synced_at" BIGINT
);

-- Indexes for supplier_purchases
CREATE INDEX IF NOT EXISTS "supplier_purchases_workspace_id_idx" ON "supplier_purchases" ("workspace_id");
CREATE INDEX IF NOT EXISTS "supplier_purchases_supplier_id_idx" ON "supplier_purchases" ("supplier_id");
CREATE INDEX IF NOT EXISTS "supplier_purchases_xero_bill_id_idx" ON "supplier_purchases" ("xero_bill_id");
CREATE INDEX IF NOT EXISTS "supplier_purchases_purchase_date_idx" ON "supplier_purchases" ("purchase_date");
CREATE INDEX IF NOT EXISTS "supplier_purchases_status_idx" ON "supplier_purchases" ("status");


-- ============= SUPPLIER PRODUCTS TABLE =============
-- Products/items we buy from each supplier (for price tracking)
CREATE TABLE IF NOT EXISTS "supplier_products" (
  "id" SERIAL PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL REFERENCES "suppliers"("id"),
  
  -- Product Info
  "product_name" TEXT NOT NULL,
  "product_category" TEXT, -- hops, malt, yeast, packaging, equipment, chemicals, other
  "product_code" TEXT,
  "unit" TEXT, -- kg, litre, unit, pallet, case
  
  -- Pricing
  "last_price" DOUBLE PRECISION,
  "last_purchase_date" BIGINT,
  "price_history" JSONB,
  
  -- Notes
  "notes" TEXT,
  
  "created_at" BIGINT NOT NULL,
  "updated_at" BIGINT NOT NULL
);

-- Indexes for supplier_products
CREATE INDEX IF NOT EXISTS "supplier_products_workspace_id_idx" ON "supplier_products" ("workspace_id");
CREATE INDEX IF NOT EXISTS "supplier_products_supplier_id_idx" ON "supplier_products" ("supplier_id");
CREATE INDEX IF NOT EXISTS "supplier_products_product_category_idx" ON "supplier_products" ("product_category");
CREATE INDEX IF NOT EXISTS "supplier_products_product_name_idx" ON "supplier_products" ("product_name");


-- ============= COMMENTS =============
COMMENT ON TABLE "suppliers" IS 'Companies/merchants we purchase from (hops, malt, packaging, etc.)';
COMMENT ON TABLE "supplier_purchases" IS 'Bills/invoices received from suppliers (synced from Xero)';
COMMENT ON TABLE "supplier_products" IS 'Products we buy from each supplier with price tracking';

COMMENT ON COLUMN "suppliers"."supplier_type" IS 'Type: hop_merchant, maltster, yeast_supplier, packaging, equipment, services, distributor, other';
COMMENT ON COLUMN "suppliers"."other_breweries_count" IS 'Intelligence: How many other breweries use this supplier';
COMMENT ON COLUMN "suppliers"."trending_score" IS 'Intelligence: Popularity/trend score for supplier discovery';
COMMENT ON COLUMN "suppliers"."discovered_by" IS 'How supplier was added: xero, manual, ai_sleeper_agent';

COMMENT ON COLUMN "supplier_purchases"."line_items" IS 'JSON array: [{description, quantity, unitPrice, amount, accountCode}]';
COMMENT ON COLUMN "supplier_purchases"."status" IS 'Bill status: draft, submitted, authorised, paid, voided';

COMMENT ON COLUMN "supplier_products"."price_history" IS 'JSON array: [{date, price, quantity}] for price trend analysis';
COMMENT ON COLUMN "supplier_products"."product_category" IS 'Category: hops, malt, yeast, packaging, equipment, chemicals, other';

