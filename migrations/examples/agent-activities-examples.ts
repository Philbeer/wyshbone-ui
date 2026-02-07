/**
 * Example usage of agent_activities table
 *
 * This file demonstrates common operations with the agent_activities schema.
 */

import pg from 'pg';

const { Pool } = pg;

// Supabase is the only supported database.
const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
});

/**
 * Example 1: Insert a new agent activity
 */
export async function insertActivity(params: {
  userId: string;
  taskGenerated: string;
  actionTaken: string;
  actionParams: any;
  results: any;
  interestingFlag: 0 | 1;
  status: 'success' | 'failed' | 'pending' | 'skipped';
  errorMessage?: string;
  durationMs?: number;
  conversationId?: string;
  runId?: string;
  metadata?: any;
}) {
  const id = `activity_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = Date.now();

  const result = await pool.query(`
    INSERT INTO agent_activities (
      id, user_id, timestamp, task_generated, action_taken,
      action_params, results, interesting_flag, status,
      error_message, duration_ms, conversation_id, run_id,
      metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *;
  `, [
    id,
    params.userId,
    timestamp,
    params.taskGenerated,
    params.actionTaken,
    JSON.stringify(params.actionParams),
    JSON.stringify(params.results),
    params.interestingFlag,
    params.status,
    params.errorMessage || null,
    params.durationMs || null,
    params.conversationId || null,
    params.runId || null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    timestamp
  ]);

  return result.rows[0];
}

/**
 * Example 2: Get recent activities for a user
 */
export async function getUserActivities(userId: string, limit: number = 10) {
  const result = await pool.query(`
    SELECT *
    FROM agent_activities
    WHERE user_id = $1
    ORDER BY timestamp DESC
    LIMIT $2;
  `, [userId, limit]);

  return result.rows;
}

/**
 * Example 3: Get interesting activities (for email notifications)
 */
export async function getInterestingActivities(userId: string, since?: number) {
  const query = since
    ? `SELECT * FROM agent_activities
       WHERE user_id = $1 AND interesting_flag = 1 AND timestamp > $2
       ORDER BY timestamp DESC;`
    : `SELECT * FROM agent_activities
       WHERE user_id = $1 AND interesting_flag = 1
       ORDER BY timestamp DESC
       LIMIT 20;`;

  const params = since ? [userId, since] : [userId];
  const result = await pool.query(query, params);

  return result.rows;
}

/**
 * Example 4: Get activities by run_id (grouped execution)
 */
export async function getActivitiesByRun(runId: string) {
  const result = await pool.query(`
    SELECT *
    FROM agent_activities
    WHERE run_id = $1
    ORDER BY timestamp ASC;
  `, [runId]);

  return result.rows;
}

/**
 * Example 5: Get activity statistics for a user
 */
export async function getUserStats(userId: string, days: number = 7) {
  const since = Date.now() - (days * 24 * 60 * 60 * 1000);

  const result = await pool.query(`
    SELECT
      COUNT(*) as total_activities,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN interesting_flag = 1 THEN 1 ELSE 0 END) as interesting,
      AVG(duration_ms) as avg_duration_ms
    FROM agent_activities
    WHERE user_id = $1 AND timestamp > $2;
  `, [userId, since]);

  return result.rows[0];
}

/**
 * Example 6: Update activity status (for pending → completed transitions)
 */
export async function updateActivityStatus(
  activityId: string,
  status: 'success' | 'failed' | 'completed' | 'skipped',
  results?: any,
  errorMessage?: string
) {
  const result = await pool.query(`
    UPDATE agent_activities
    SET
      status = $2,
      results = COALESCE($3, results),
      error_message = $4
    WHERE id = $1
    RETURNING *;
  `, [
    activityId,
    status,
    results ? JSON.stringify(results) : null,
    errorMessage || null
  ]);

  return result.rows[0];
}

/**
 * Example 7: Delete old activities (data retention)
 */
export async function deleteOldActivities(daysToKeep: number = 90) {
  const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

  const result = await pool.query(`
    DELETE FROM agent_activities
    WHERE timestamp < $1;
  `, [cutoffDate]);

  return result.rowCount;
}

/**
 * Example usage
 */
export async function exampleUsage() {
  // Insert a new activity
  const activity = await insertActivity({
    userId: 'user_123',
    taskGenerated: 'Find new craft breweries in Manchester',
    actionTaken: 'search_google_places',
    actionParams: { query: 'craft breweries', location: 'Manchester' },
    results: { count: 12, places: [] },
    interestingFlag: 1,
    status: 'success',
    durationMs: 2500,
    runId: 'run_20260109_001'
  });

  console.log('Created activity:', activity.id);

  // Get recent activities
  const recent = await getUserActivities('user_123', 5);
  console.log(`Found ${recent.length} recent activities`);

  // Get interesting activities
  const interesting = await getInterestingActivities('user_123');
  console.log(`Found ${interesting.length} interesting activities`);

  // Get stats
  const stats = await getUserStats('user_123', 7);
  console.log('User stats:', stats);
}

// Run example if executed directly
if (require.main === module) {
  exampleUsage()
    .then(() => {
      console.log('✅ Example completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Example failed:', err);
      process.exit(1);
    });
}
