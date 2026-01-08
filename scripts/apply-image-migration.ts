import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

// Parse the connection string
const url = new URL(DATABASE_URL.replace('postgresql://', 'https://'));
const [user, password] = url.username.includes(':')
  ? url.username.split(':')
  : [url.username, url.password];

const supabaseUrl = `https://${url.hostname.split('.')[0]}.supabase.co`;
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

console.log('🔗 Connecting to Supabase...');
console.log('📍 URL:', supabaseUrl);

// Read the migration file
const migrationPath = path.join(process.cwd(), 'drizzle', 'migrations', '2026_01_08_add_brew_product_image_url.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('📄 Migration SQL:');
console.log(migrationSQL);

// Execute using raw SQL
async function applyMigration() {
  try {
    // Use the connection string directly for admin operations
    const pg = await import('pg');
    const client = new pg.default.Client({ connectionString: DATABASE_URL });

    await client.connect();
    console.log('✅ Connected to database');

    // Execute the migration
    await client.query(migrationSQL);
    console.log('✅ Migration applied successfully!');

    // Verify the column exists
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'brew_products' AND column_name = 'image_url'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verified: image_url column exists');
      console.log('   Type:', result.rows[0].data_type);
    } else {
      console.log('⚠️  Warning: image_url column not found after migration');
    }

    await client.end();
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigration();
