import postgres from 'postgres';

// Supabase is the only supported database.
if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error('SUPABASE_DATABASE_URL environment variable is required');
}
const client = postgres(process.env.SUPABASE_DATABASE_URL);

async function fixCrmOrdersSchema() {
  try {
    console.log('\n=== Adding missing columns to crm_orders table ===\n');

    // Add is_sample column
    console.log('Adding is_sample column...');
    await client`
      ALTER TABLE crm_orders
      ADD COLUMN IF NOT EXISTS is_sample boolean DEFAULT false
    `;
    console.log('✅ is_sample column added');

    // Add sync_status column
    console.log('Adding sync_status column...');
    await client`
      ALTER TABLE crm_orders
      ADD COLUMN IF NOT EXISTS sync_status varchar(20) DEFAULT 'synced'
    `;
    console.log('✅ sync_status column added');

    // Add last_sync_error column
    console.log('Adding last_sync_error column...');
    await client`
      ALTER TABLE crm_orders
      ADD COLUMN IF NOT EXISTS last_sync_error text
    `;
    console.log('✅ last_sync_error column added');

    // Add index on is_sample
    console.log('Adding index on is_sample...');
    await client`
      CREATE INDEX IF NOT EXISTS crm_orders_is_sample_idx ON crm_orders(is_sample)
    `;
    console.log('✅ is_sample index added');

    console.log('\n✅ All missing columns added successfully!');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
    }
  } finally {
    await client.end();
  }
}

fixCrmOrdersSchema();
