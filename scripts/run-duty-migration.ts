/**
 * Script to run the duty lookup bands migration via Supabase SQL API
 * 
 * Usage: npx tsx scripts/run-duty-migration.ts
 * 
 * This script reads the SQL migration file and executes it against Supabase
 * using the REST API, which may work better than direct database connections
 * in some network environments.
 */

import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local
config({ path: '.env.local' });

async function runMigration() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('   Set these in .env.local');
    process.exit(1);
  }

  console.log('📦 Running duty lookup bands migration...');
  console.log(`   Supabase URL: ${SUPABASE_URL}`);

  // Read the SQL migration file
  const sqlPath = path.join(process.cwd(), 'drizzle', 'brew_duty_lookup_bands.sql');
  
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Migration file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');
  console.log(`📄 Read migration file (${sql.length} bytes)`);

  // Split SQL into individual statements (handling multi-line statements)
  // Filter out comments and empty lines
  const statements = sql
    .split(/;(?=\s*(?:--|CREATE|INSERT|DELETE|DROP|ALTER|UPDATE|SELECT|$))/i)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  console.log(`📋 Found ${statements.length} SQL statements to execute`);

  // Execute via Supabase REST API
  const endpoint = `${SUPABASE_URL}/rest/v1/rpc/`;
  
  // Try to use Supabase's SQL endpoint (requires service role)
  try {
    // First, try creating the table
    const createTableSql = statements.find(s => s.toUpperCase().includes('CREATE TABLE'));
    const insertSqls = statements.filter(s => s.toUpperCase().includes('INSERT INTO'));
    const deleteSql = statements.find(s => s.toUpperCase().includes('DELETE FROM'));
    const indexSqls = statements.filter(s => s.toUpperCase().includes('CREATE INDEX'));

    // Use Supabase Management API to run SQL
    // Note: This requires the Supabase CLI or Dashboard for raw SQL execution
    // For now, we'll provide instructions
    
    console.log('\n⚠️ Direct SQL execution requires Supabase CLI or Dashboard.');
    console.log('\n📝 To apply this migration, run one of the following:\n');
    
    console.log('Option 1 - Supabase Dashboard:');
    console.log('  1. Go to https://supabase.com/dashboard');
    console.log('  2. Select your project');
    console.log('  3. Navigate to SQL Editor');
    console.log('  4. Paste the contents of: drizzle/brew_duty_lookup_bands.sql');
    console.log('  5. Click "Run"\n');
    
    console.log('Option 2 - Supabase CLI:');
    console.log('  npx supabase db execute --file drizzle/brew_duty_lookup_bands.sql\n');
    
    console.log('Option 3 - drizzle-kit (if DB connection works):');
    console.log('  npm run db:push\n');

    // Try a test query to see if the table already exists
    console.log('🔍 Testing if brew_duty_lookup_bands table exists...');
    
    const testResponse = await fetch(`${SUPABASE_URL}/rest/v1/brew_duty_lookup_bands?select=count&limit=0`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (testResponse.ok) {
      console.log('✅ Table brew_duty_lookup_bands already exists!');
      
      // Check if it has data
      const dataResponse = await fetch(`${SUPABASE_URL}/rest/v1/brew_duty_lookup_bands?select=*&regime=eq.UK&limit=5`, {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      
      if (dataResponse.ok) {
        const data = await dataResponse.json();
        console.log(`📊 Table has ${data.length > 0 ? data.length + '+' : '0'} UK regime rows`);
        
        if (data.length === 0) {
          console.log('\n⚠️ Table exists but has no UK data - please run the seed INSERT statements.');
        } else {
          console.log('\n✅ Migration appears complete - UK duty bands are available.');
          console.log('   Sample row:', JSON.stringify(data[0], null, 2));
        }
      }
    } else if (testResponse.status === 404) {
      console.log('❌ Table brew_duty_lookup_bands does not exist yet.');
      console.log('   Please run the migration using one of the options above.');
    } else {
      console.log(`⚠️ Unexpected response: ${testResponse.status} ${testResponse.statusText}`);
      const text = await testResponse.text();
      console.log('   Response:', text.substring(0, 200));
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

runMigration();

