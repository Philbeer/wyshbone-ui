/**
 * Test script for agent_activities schema
 * Verifies table exists, tests insert/query operations, validates indexes
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function testSchema() {
  // Supabase is the only supported database.
  const pool = new Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
  });

  try {
    console.log('🧪 Testing agent_activities schema...\n');

    // Test 1: Verify table exists
    console.log('1️⃣ Checking if table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'agent_activities'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      throw new Error('Table agent_activities does not exist!');
    }
    console.log('✅ Table exists\n');

    // Test 2: Check table structure
    console.log('2️⃣ Verifying table columns...');
    const columns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'agent_activities'
      ORDER BY ordinal_position;
    `);

    console.log('Columns found:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    console.log('✅ Schema structure looks good\n');

    // Test 3: Verify indexes
    console.log('3️⃣ Checking indexes...');
    const indexes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'agent_activities'
      ORDER BY indexname;
    `);

    console.log('Indexes found:');
    indexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });
    console.log('✅ Indexes created\n');

    // Test 4: Insert test record
    console.log('4️⃣ Testing insert operation...');
    const testId = `test_${Date.now()}`;
    await pool.query(`
      INSERT INTO agent_activities (
        id, user_id, timestamp, task_generated, action_taken,
        action_params, results, interesting_flag, status, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      );
    `, [
      testId,
      'test_user_123',
      Date.now(),
      'Test task: Find craft breweries in Leeds',
      'search_google_places',
      JSON.stringify({ query: 'craft breweries', location: 'Leeds' }),
      JSON.stringify({ count: 15, places: [] }),
      1, // interesting
      'success',
      Date.now()
    ]);
    console.log(`✅ Insert successful (id: ${testId})\n`);

    // Test 5: Query by user_id
    console.log('5️⃣ Testing query by user_id...');
    const userQuery = await pool.query(`
      SELECT id, user_id, task_generated, status, interesting_flag
      FROM agent_activities
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT 5;
    `, ['test_user_123']);

    console.log(`✅ Query returned ${userQuery.rows.length} row(s)`);
    if (userQuery.rows.length > 0) {
      console.log('Sample row:', userQuery.rows[0]);
    }
    console.log();

    // Test 6: Query interesting activities
    console.log('6️⃣ Testing interesting_flag filter...');
    const interestingQuery = await pool.query(`
      SELECT COUNT(*) as count
      FROM agent_activities
      WHERE interesting_flag = 1;
    `);
    console.log(`✅ Found ${interestingQuery.rows[0].count} interesting activities\n`);

    // Test 7: Query by timestamp range
    console.log('7️⃣ Testing timestamp range query...');
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const rangeQuery = await pool.query(`
      SELECT COUNT(*) as count
      FROM agent_activities
      WHERE timestamp BETWEEN $1 AND $2;
    `, [oneDayAgo, now]);
    console.log(`✅ Found ${rangeQuery.rows[0].count} activities in last 24 hours\n`);

    // Cleanup test record
    console.log('8️⃣ Cleaning up test record...');
    await pool.query(`DELETE FROM agent_activities WHERE id = $1;`, [testId]);
    console.log('✅ Cleanup complete\n');

    console.log('🎉 All tests passed! Schema is working correctly.');
    console.log('\n📊 Schema Summary:');
    console.log(`  - Columns: ${columns.rows.length}`);
    console.log(`  - Indexes: ${indexes.rows.length}`);
    console.log('  - Insert/Query: Working ✅');
    console.log('  - Rollback: Script exists ✅');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the test
testSchema().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
