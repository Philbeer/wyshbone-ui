-- ============================================
-- XERO CUSTOMER SYNC MIGRATION
-- ============================================
-- Adds Xero contact synchronization support to CRM
-- Part 1: Import Customers from Xero to Wyshbone CRM
-- ============================================

-- Add Xero sync fields to customers table
ALTER TABLE crm_customers 
ADD COLUMN IF NOT EXISTS xero_contact_id VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS last_xero_sync_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS xero_sync_status VARCHAR(20) DEFAULT 'synced'; -- 'synced', 'pending', 'error'

CREATE INDEX IF NOT EXISTS idx_customers_xero_contact_id ON crm_customers(xero_contact_id);

-- ============================================
-- XERO CONNECTIONS TABLE
-- ============================================
-- Store Xero connection details per workspace (OAuth tokens)
CREATE TABLE IF NOT EXISTS xero_connections (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE,
  tenant_id VARCHAR(100) NOT NULL,
  tenant_name VARCHAR(200),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  last_import_at TIMESTAMP,
  is_connected BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xero_connections_workspace ON xero_connections(workspace_id);

-- ============================================
-- XERO IMPORT JOBS TABLE
-- ============================================
-- Track import jobs for progress reporting
CREATE TABLE IF NOT EXISTS xero_import_jobs (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  job_type VARCHAR(50) NOT NULL, -- 'customers', 'orders', 'products'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xero_import_jobs_workspace ON xero_import_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_xero_import_jobs_status ON xero_import_jobs(status);

-- Comments for documentation
COMMENT ON TABLE xero_connections IS 'Stores Xero OAuth tokens and connection status per workspace';
COMMENT ON TABLE xero_import_jobs IS 'Tracks progress of Xero import operations';
COMMENT ON COLUMN crm_customers.xero_contact_id IS 'Xero ContactID for sync tracking';
COMMENT ON COLUMN crm_customers.last_xero_sync_at IS 'When this customer was last synced with Xero';
COMMENT ON COLUMN crm_customers.xero_sync_status IS 'Current sync status: synced, pending, or error';

