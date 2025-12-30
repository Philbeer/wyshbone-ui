-- ============================================================
-- BREWCRM ESSENTIALS BUNDLE MIGRATION
-- Date: 2024-12-30
-- Features: Trade Store, Advanced Filtering, Activity Tracking,
--           Container QR Tracking, Basic Reporting
-- ============================================================

-- ============================================================
-- FEATURE 1: TRADE STORE
-- ============================================================

-- Trade Store Settings
CREATE TABLE IF NOT EXISTS brew_trade_store_settings (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE,
  is_enabled INTEGER DEFAULT 0, -- 0 = false, 1 = true
  store_name VARCHAR(200),
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#1a56db',
  welcome_message TEXT,
  require_approval INTEGER DEFAULT 1, -- 0 = false, 1 = true
  show_stock_levels INTEGER DEFAULT 1,
  allow_backorders INTEGER DEFAULT 0,
  min_order_value INTEGER, -- in pence
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trade_store_settings_workspace ON brew_trade_store_settings(workspace_id);

-- Customer Access Codes
CREATE TABLE IF NOT EXISTS brew_trade_store_access (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  access_code VARCHAR(100) NOT NULL UNIQUE,
  is_active INTEGER DEFAULT 1,
  approved_at BIGINT,
  last_login_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(workspace_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_store_access_workspace ON brew_trade_store_access(workspace_id);
CREATE INDEX IF NOT EXISTS idx_trade_store_access_code ON brew_trade_store_access(access_code);
CREATE INDEX IF NOT EXISTS idx_trade_store_access_customer ON brew_trade_store_access(customer_id);

-- Customer Sessions
CREATE TABLE IF NOT EXISTS brew_trade_store_sessions (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  session_token VARCHAR(200) NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trade_store_sessions_token ON brew_trade_store_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_trade_store_sessions_customer ON brew_trade_store_sessions(customer_id);

-- ============================================================
-- FEATURE 2: ADVANCED FILTERING
-- ============================================================

-- Saved Filters
CREATE TABLE IF NOT EXISTS crm_saved_filters (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  filter_config JSONB NOT NULL,
  is_dynamic INTEGER DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_workspace ON crm_saved_filters(workspace_id);

-- Customer Tags
CREATE TABLE IF NOT EXISTS crm_customer_tags (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#6b7280',
  created_at BIGINT NOT NULL,
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_customer_tags_workspace ON crm_customer_tags(workspace_id);

-- Tag Assignments
CREATE TABLE IF NOT EXISTS crm_customer_tag_assignments (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES crm_customer_tags(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  UNIQUE(customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_customer ON crm_customer_tag_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_tag ON crm_customer_tag_assignments(tag_id);

-- Customer Groups
CREATE TABLE IF NOT EXISTS crm_customer_groups (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_customer_groups_workspace ON crm_customer_groups(workspace_id);

-- Add group_id to customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'crm_customers' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE crm_customers ADD COLUMN group_id INTEGER REFERENCES crm_customer_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_group ON crm_customers(group_id);

-- ============================================================
-- FEATURE 3: ACTIVITY TRACKING & TASKS
-- ============================================================

-- Activities (calls, meetings, notes)
CREATE TABLE IF NOT EXISTS crm_activities (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT,
  lead_id TEXT,
  activity_type VARCHAR(50) NOT NULL, -- 'call', 'meeting', 'email', 'note'
  subject VARCHAR(200),
  notes TEXT,
  outcome VARCHAR(100),
  duration_minutes INTEGER,
  completed_at BIGINT,
  created_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_workspace ON crm_activities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activities_customer ON crm_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON crm_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON crm_activities(created_at);

-- Tasks (follow-ups, reminders)
CREATE TABLE IF NOT EXISTS crm_tasks (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT,
  lead_id TEXT,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date BIGINT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'
  completed_at BIGINT,
  assigned_to TEXT,
  created_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON crm_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_customer ON crm_tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON crm_tasks(priority);

-- ============================================================
-- FEATURE 4: CONTAINER QR TRACKING
-- ============================================================

-- Add QR code to containers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'brew_containers' AND column_name = 'qr_code'
  ) THEN
    ALTER TABLE brew_containers ADD COLUMN qr_code VARCHAR(100) UNIQUE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'brew_containers' AND column_name = 'barcode'
  ) THEN
    ALTER TABLE brew_containers ADD COLUMN barcode VARCHAR(100) UNIQUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_containers_qr_code ON brew_containers(qr_code);
CREATE INDEX IF NOT EXISTS idx_containers_barcode ON brew_containers(barcode);

-- Container Movements Log
CREATE TABLE IF NOT EXISTS brew_container_movements (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  movement_type VARCHAR(50) NOT NULL, -- 'filled', 'dispatched', 'returned', 'cleaned', 'inspected'
  from_location VARCHAR(100),
  to_location VARCHAR(100),
  customer_id TEXT,
  order_id TEXT,
  batch_id TEXT,
  notes TEXT,
  scanned_by TEXT,
  scanned_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_container_movements_workspace ON brew_container_movements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_container_movements_container ON brew_container_movements(container_id);
CREATE INDEX IF NOT EXISTS idx_container_movements_customer ON brew_container_movements(customer_id);
CREATE INDEX IF NOT EXISTS idx_container_movements_type ON brew_container_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_container_movements_scanned_at ON brew_container_movements(scanned_at);

-- ============================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================
COMMENT ON TABLE brew_trade_store_settings IS 'Configuration for the B2B customer self-service portal';
COMMENT ON TABLE brew_trade_store_access IS 'Customer access codes for the trade store';
COMMENT ON TABLE brew_trade_store_sessions IS 'Active customer sessions in the trade store';
COMMENT ON TABLE crm_saved_filters IS 'Saved customer filter configurations for reuse';
COMMENT ON TABLE crm_customer_tags IS 'Tags for categorizing and segmenting customers';
COMMENT ON TABLE crm_customer_tag_assignments IS 'Assignment of tags to customers (many-to-many)';
COMMENT ON TABLE crm_customer_groups IS 'Customer groups for organization';
COMMENT ON TABLE crm_activities IS 'Activity log for calls, meetings, emails, and notes';
COMMENT ON TABLE crm_tasks IS 'Tasks and follow-ups for CRM workflow';
COMMENT ON TABLE brew_container_movements IS 'Tracking log for container movements and scans';

