import postgres from 'postgres';

const DATABASE_URL = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('No database URL found');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function createTable() {
  console.log('Creating afr_run_bundles table...');
  
  await sql`
    CREATE TABLE IF NOT EXISTS afr_run_bundles (
      run_id TEXT PRIMARY KEY,
      bundle JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `;
  
  console.log('Done');
  await sql.end();
}

createTable().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
