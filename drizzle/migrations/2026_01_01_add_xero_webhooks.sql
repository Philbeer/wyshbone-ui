-- ============================================
-- XERO TWO-WAY SYNC - PART 3 MIGRATION
-- Adds webhook events, sync queue, and sync status tracking
-- ============================================

-- ============================================
-- XERO WEBHOOK EVENTS TABLE
-- Track incoming webhook events from Xero
-- ============================================
CREATE TABLE IF NOT EXISTS xero_webhook_events (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  event_id VARCHAR(100) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE
  event_category VARCHAR(50) NOT NULL, -- INVOICE, CONTACT, ITEM
  resource_id VARCHAR(100) NOT NULL,
  tenant_id VARCHAR(100) NOT NULL,
  event_date TIMESTAMP NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS xero_webhook_events_workspace_idx ON xero_webhook_events(workspace_id);
CREATE INDEX IF NOT EXISTS xero_webhook_events_processed_idx ON xero_webhook_events(processed);
CREATE INDEX IF NOT EXISTS xero_webhook_events_event_id_idx ON xero_webhook_events(event_id);

COMMENT ON TABLE xero_webhook_events IS 'Incoming webhook events from Xero for real-time sync';
COMMENT ON COLUMN xero_webhook_events.event_type IS 'Type of event: CREATE, UPDATE, DELETE';
COMMENT ON COLUMN xero_webhook_events.event_category IS 'Category: INVOICE, CONTACT, ITEM';

-- ============================================
-- XERO SYNC QUEUE TABLE
-- Queue for retrying failed syncs to Xero
-- ============================================
CREATE TABLE IF NOT EXISTS xero_sync_queue (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- order, customer, product
  entity_id TEXT NOT NULL,
  action VARCHAR(50) NOT NULL, -- create, update, void
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS xero_sync_queue_workspace_idx ON xero_sync_queue(workspace_id);
CREATE INDEX IF NOT EXISTS xero_sync_queue_next_retry_idx ON xero_sync_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS xero_sync_queue_entity_idx ON xero_sync_queue(entity_type, entity_id);

COMMENT ON TABLE xero_sync_queue IS 'Queue for retrying failed syncs from Wyshbone to Xero';
COMMENT ON COLUMN xero_sync_queue.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN xero_sync_queue.next_retry_at IS 'When to retry (exponential backoff)';

-- ============================================
-- ADD SYNC STATUS TO ORDERS
-- ============================================
ALTER TABLE crm_orders
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

COMMENT ON COLUMN crm_orders.sync_status IS 'Sync status with Xero: synced, pending, failed';
COMMENT ON COLUMN crm_orders.last_sync_error IS 'Error message from last failed sync attempt';

-- ============================================
-- ADD SYNC ERROR TO CUSTOMERS
-- (Already has xero_sync_status, just add error field)
-- ============================================
ALTER TABLE crm_customers
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

COMMENT ON COLUMN crm_customers.last_sync_error IS 'Error message from last failed sync attempt';

-- ============================================
-- ADD SYNC STATUS TO PRODUCTS
-- ============================================
ALTER TABLE brew_products
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

COMMENT ON COLUMN brew_products.sync_status IS 'Sync status with Xero: synced, pending, failed';
COMMENT ON COLUMN brew_products.last_sync_error IS 'Error message from last failed sync attempt';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the migration:
--
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'xero_webhook_events';
--
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'xero_sync_queue';
--
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'crm_orders' AND column_name IN ('sync_status', 'last_sync_error');











