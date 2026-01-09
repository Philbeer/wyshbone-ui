-- Create Xero sync tables (webhook events and sync queue)
-- Modified from 2026_01_01_add_xero_webhooks.sql to use crm_products

-- Xero webhook events table
CREATE TABLE IF NOT EXISTS xero_webhook_events (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  event_id VARCHAR(100) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_category VARCHAR(50) NOT NULL,
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

-- Xero sync queue table
CREATE TABLE IF NOT EXISTS xero_sync_queue (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT NOT NULL,
  action VARCHAR(50) NOT NULL,
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

-- Add sync status columns to crm_orders
ALTER TABLE crm_orders
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

-- Add sync error column to crm_customers
ALTER TABLE crm_customers
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

-- Add sync status columns to crm_products (not brew_products)
ALTER TABLE crm_products
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
