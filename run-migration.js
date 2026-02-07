// Quick script to run a migration
import { promises as fs } from 'fs';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function runMigration() {
  // Supabase is the only supported database.
  const pool = new Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
  });

  try {
    const sql = await fs.readFile(process.argv[2], 'utf-8');
    console.log('Running migration:', process.argv[2]);
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(err => {
  process.exit(1);
});
