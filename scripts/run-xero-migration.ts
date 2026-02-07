/**
 * Migration script for Xero sync - Parts 2 & 3
 * - Adds Xero sync columns to crm_products, crm_orders, crm_order_lines
 * - Creates xero_webhook_events and xero_sync_queue tables for Part 3
 */
import postgres from 'postgres';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from repo root
config({ path: resolve(__dirname, '..', '.env.local') });

// Supabase is the only supported database.
const DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ SUPABASE_DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function runMigration() {
  console.log('🔄 Running Xero sync migration (Parts 2 & 3)...');
  
  try {
    // ============================================
    // PART 2: Basic Xero columns
    // ============================================
    console.log('\n📦 PART 2: Basic Xero columns');
    
    // Add columns to crm_products
    console.log('  Adding columns to crm_products...');
    await sql`
      ALTER TABLE crm_products
      ADD COLUMN IF NOT EXISTS xero_item_id TEXT,
      ADD COLUMN IF NOT EXISTS xero_item_code TEXT,
      ADD COLUMN IF NOT EXISTS last_xero_sync_at TIMESTAMP
    `;
    console.log('  ✅ crm_products columns added');
    
    // Add columns to crm_orders
    console.log('  Adding columns to crm_orders...');
    await sql`
      ALTER TABLE crm_orders
      ADD COLUMN IF NOT EXISTS xero_invoice_number TEXT,
      ADD COLUMN IF NOT EXISTS last_xero_sync_at TIMESTAMP
    `;
    console.log('  ✅ crm_orders columns added');
    
    // Add column to crm_order_lines
    console.log('  Adding column to crm_order_lines...');
    await sql`
      ALTER TABLE crm_order_lines
      ADD COLUMN IF NOT EXISTS xero_line_item_id TEXT
    `;
    console.log('  ✅ crm_order_lines column added');
    
    // Create indexes for Part 2
    console.log('  Creating indexes...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_crm_products_xero_item_id ON crm_products(xero_item_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_crm_products_xero_item_code ON crm_products(xero_item_code)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_crm_orders_xero_invoice_id_uniq ON crm_orders(xero_invoice_id) WHERE xero_invoice_id IS NOT NULL
    `;
    console.log('  ✅ Indexes created');

    // ============================================
    // PART 3: Webhook events and sync queue tables
    // ============================================
    console.log('\n🔗 PART 3: Webhook & Sync Queue tables');
    
    // Create xero_webhook_events table
    console.log('  Creating xero_webhook_events table...');
    await sql`
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS xero_webhook_events_workspace_idx ON xero_webhook_events(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS xero_webhook_events_processed_idx ON xero_webhook_events(processed)`;
    await sql`CREATE INDEX IF NOT EXISTS xero_webhook_events_event_id_idx ON xero_webhook_events(event_id)`;
    console.log('  ✅ xero_webhook_events table created');
    
    // Create xero_sync_queue table
    console.log('  Creating xero_sync_queue table...');
    await sql`
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS xero_sync_queue_workspace_idx ON xero_sync_queue(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS xero_sync_queue_next_retry_idx ON xero_sync_queue(next_retry_at)`;
    await sql`CREATE INDEX IF NOT EXISTS xero_sync_queue_entity_idx ON xero_sync_queue(entity_type, entity_id)`;
    console.log('  ✅ xero_sync_queue table created');
    
    // Add sync status columns
    console.log('  Adding sync status columns...');
    await sql`
      ALTER TABLE crm_orders
      ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced',
      ADD COLUMN IF NOT EXISTS last_sync_error TEXT
    `;
    await sql`
      ALTER TABLE crm_customers
      ADD COLUMN IF NOT EXISTS last_sync_error TEXT
    `;
    await sql`
      ALTER TABLE crm_products
      ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced',
      ADD COLUMN IF NOT EXISTS last_sync_error TEXT
    `;
    console.log('  ✅ Sync status columns added');
    
    console.log('\n✅ All migrations complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});


