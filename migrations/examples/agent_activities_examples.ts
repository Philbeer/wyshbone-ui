/**
 * Agent Activities - Example Queries and Usage
 *
 * This file demonstrates how to work with the agent_activities table.
 * Run these examples to understand the API and test the schema.
 */

import { eq, desc, and, count, sql, gte, lte } from 'drizzle-orm';
import { agentActivities, type InsertAgentActivity, type SelectAgentActivity } from '@shared/schema';
import { storage } from '../../server/storage';

// ============= EXAMPLE 1: Insert a Single Activity =============

export async function exampleInsertActivity() {
  const activityId = `activity_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const now = Date.now();

  const newActivity: InsertAgentActivity = {
    id: activityId,
    userId: 'user_demo_123',
    timestamp: now,
    taskGenerated: 'Search for craft breweries in Manchester',
    actionTaken: 'search_google_places',
    actionParams: {
      query: 'craft breweries',
      location: 'Manchester',
      maxResults: 20,
      country: 'GB'
    },
    results: {
      places_found: 18,
      top_result: 'Cloudwater Brew Co',
      execution_time_ms: 1250
    },
    interestingFlag: 1, // Marked as interesting
    status: 'success',
    errorMessage: null,
    durationMs: 1250,
    conversationId: null,
    runId: 'run_2026-01-04_morning',
    metadata: {
      source: 'autonomous_agent',
      version: '1.0',
      trigger: 'scheduled_monitor'
    },
    createdAt: now
  };

  await storage.db.insert(agentActivities).values(newActivity);
  console.log(`✅ Inserted activity: ${activityId}`);
  return activityId;
}

// ============= EXAMPLE 2: Batch Insert Multiple Activities =============

export async function exampleBatchInsert() {
  const runId = `run_${Date.now()}`;
  const now = Date.now();

  const activities: InsertAgentActivity[] = [
    {
      id: `activity_${now}_1`,
      userId: 'user_demo_123',
      timestamp: now,
      taskGenerated: 'Generate daily report',
      actionTaken: 'deep_research',
      actionParams: { topic: 'Beer market trends', mode: 'report' },
      results: { run_id: 'research_abc123' },
      interestingFlag: 1,
      status: 'success',
      durationMs: 5000,
      runId,
      createdAt: now
    },
    {
      id: `activity_${now}_2`,
      userId: 'user_demo_123',
      timestamp: now + 1000,
      taskGenerated: 'Find new pub contacts',
      actionTaken: 'batch_contact_finder',
      actionParams: { query: 'pubs', location: 'Leeds', limit: 30 },
      results: { contacts_found: 25, emails_sent: 20 },
      interestingFlag: 1,
      status: 'success',
      durationMs: 15000,
      runId,
      createdAt: now + 1000
    },
    {
      id: `activity_${now}_3`,
      userId: 'user_demo_123',
      timestamp: now + 2000,
      taskGenerated: 'Send notification email',
      actionTaken: 'send_email',
      actionParams: { to: 'user@example.com', subject: 'Daily Report' },
      results: { email_sent: true },
      interestingFlag: 0, // Routine action
      status: 'success',
      durationMs: 500,
      runId,
      createdAt: now + 2000
    }
  ];

  await storage.db.insert(agentActivities).values(activities);
  console.log(`✅ Inserted ${activities.length} activities in run: ${runId}`);
  return runId;
}

// ============= EXAMPLE 3: Query Recent Activities =============

export async function exampleQueryRecent(userId: string, limit: number = 50) {
  const activities = await storage.db
    .select()
    .from(agentActivities)
    .where(eq(agentActivities.userId, userId))
    .orderBy(desc(agentActivities.timestamp))
    .limit(limit);

  console.log(`Found ${activities.length} recent activities for user ${userId}`);
  return activities;
}

// ============= EXAMPLE 4: Query Interesting Activities =============

export async function exampleQueryInteresting(userId: string, limit: number = 10) {
  const interesting = await storage.db
    .select()
    .from(agentActivities)
    .where(
      and(
        eq(agentActivities.userId, userId),
        eq(agentActivities.interestingFlag, 1)
      )
    )
    .orderBy(desc(agentActivities.timestamp))
    .limit(limit);

  console.log(`Found ${interesting.length} interesting activities`);
  return interesting;
}

// ============= EXAMPLE 5: Query by Run ID =============

export async function exampleQueryByRun(runId: string) {
  const activities = await storage.db
    .select()
    .from(agentActivities)
    .where(eq(agentActivities.runId, runId))
    .orderBy(agentActivities.timestamp);

  console.log(`Found ${activities.length} activities in run: ${runId}`);
  return activities;
}

// ============= EXAMPLE 6: Query Failed Activities =============

export async function exampleQueryFailed(userId: string) {
  const failed = await storage.db
    .select()
    .from(agentActivities)
    .where(
      and(
        eq(agentActivities.userId, userId),
        eq(agentActivities.status, 'failed')
      )
    )
    .orderBy(desc(agentActivities.timestamp))
    .limit(20);

  console.log(`Found ${failed.length} failed activities for debugging`);
  return failed;
}

// ============= EXAMPLE 7: Calculate Success Rate =============

export async function exampleSuccessRate(userId: string) {
  const stats = await storage.db
    .select({
      total: count(),
      successful: sql<number>`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      successRate: sql<number>`
        ROUND(
          100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
          2
        )
      `
    })
    .from(agentActivities)
    .where(eq(agentActivities.userId, userId));

  console.log('Activity Statistics:', stats[0]);
  return stats[0];
}

// ============= EXAMPLE 8: Query by Time Range =============

export async function exampleQueryTimeRange(
  userId: string,
  startTime: number,
  endTime: number
) {
  const activities = await storage.db
    .select()
    .from(agentActivities)
    .where(
      and(
        eq(agentActivities.userId, userId),
        gte(agentActivities.timestamp, startTime),
        lte(agentActivities.timestamp, endTime)
      )
    )
    .orderBy(desc(agentActivities.timestamp));

  console.log(
    `Found ${activities.length} activities between ${new Date(startTime).toISOString()} and ${new Date(endTime).toISOString()}`
  );
  return activities;
}

// ============= EXAMPLE 9: Query by Action Type =============

export async function exampleQueryByAction(userId: string, actionName: string) {
  const activities = await storage.db
    .select()
    .from(agentActivities)
    .where(
      and(
        eq(agentActivities.userId, userId),
        eq(agentActivities.actionTaken, actionName)
      )
    )
    .orderBy(desc(agentActivities.timestamp))
    .limit(50);

  console.log(`Found ${activities.length} '${actionName}' activities`);
  return activities;
}

// ============= EXAMPLE 10: Get Average Duration by Action =============

export async function exampleAverageDuration(userId: string) {
  const avgDurations = await storage.db
    .select({
      actionTaken: agentActivities.actionTaken,
      count: count(),
      avgDurationMs: sql<number>`ROUND(AVG(duration_ms))`,
      minDurationMs: sql<number>`MIN(duration_ms)`,
      maxDurationMs: sql<number>`MAX(duration_ms)`
    })
    .from(agentActivities)
    .where(
      and(
        eq(agentActivities.userId, userId),
        sql`duration_ms IS NOT NULL`
      )
    )
    .groupBy(agentActivities.actionTaken)
    .orderBy(desc(count()));

  console.log('Average Durations by Action:');
  avgDurations.forEach(row => {
    console.log(
      `  ${row.actionTaken}: ${row.avgDurationMs}ms avg (${row.minDurationMs}-${row.maxDurationMs}ms) over ${row.count} runs`
    );
  });
  return avgDurations;
}

// ============= EXAMPLE 11: Get Activity Counts by Status =============

export async function exampleStatusBreakdown(userId: string) {
  const breakdown = await storage.db
    .select({
      status: agentActivities.status,
      count: count(),
      percentage: sql<number>`
        ROUND(
          100.0 * COUNT(*) / SUM(COUNT(*)) OVER(),
          2
        )
      `
    })
    .from(agentActivities)
    .where(eq(agentActivities.userId, userId))
    .groupBy(agentActivities.status)
    .orderBy(desc(count()));

  console.log('Activity Status Breakdown:');
  breakdown.forEach(row => {
    console.log(`  ${row.status}: ${row.count} (${row.percentage}%)`);
  });
  return breakdown;
}

// ============= EXAMPLE 12: Update Activity Status =============

export async function exampleUpdateStatus(
  activityId: string,
  newStatus: 'success' | 'failed' | 'pending' | 'skipped',
  results?: any,
  errorMessage?: string,
  durationMs?: number
) {
  await storage.db
    .update(agentActivities)
    .set({
      status: newStatus,
      results: results || undefined,
      errorMessage: errorMessage || null,
      durationMs: durationMs || undefined
    })
    .where(eq(agentActivities.id, activityId));

  console.log(`✅ Updated activity ${activityId} status to: ${newStatus}`);
}

// ============= EXAMPLE 13: Delete Old Activities =============

export async function exampleCleanupOld(daysToKeep: number = 90) {
  const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

  const result = await storage.db
    .delete(agentActivities)
    .where(lte(agentActivities.timestamp, cutoffTime));

  console.log(`✅ Deleted activities older than ${daysToKeep} days`);
  return result;
}

// ============= EXAMPLE 14: Get Recent Interesting Activities for Email =============

export async function exampleGetInterestingForEmail(userId: string, since: number) {
  const interesting = await storage.db
    .select({
      id: agentActivities.id,
      timestamp: agentActivities.timestamp,
      taskGenerated: agentActivities.taskGenerated,
      actionTaken: agentActivities.actionTaken,
      results: agentActivities.results,
      durationMs: agentActivities.durationMs
    })
    .from(agentActivities)
    .where(
      and(
        eq(agentActivities.userId, userId),
        eq(agentActivities.interestingFlag, 1),
        eq(agentActivities.status, 'success'),
        gte(agentActivities.timestamp, since)
      )
    )
    .orderBy(desc(agentActivities.timestamp));

  console.log(
    `Found ${interesting.length} interesting activities for email notification`
  );
  return interesting;
}

// ============= RUN ALL EXAMPLES =============

export async function runAllExamples() {
  console.log('\n🧪 Running Agent Activities Examples...\n');

  try {
    // Example 1: Insert single activity
    console.log('--- EXAMPLE 1: Insert Single Activity ---');
    const activityId = await exampleInsertActivity();

    // Example 2: Batch insert
    console.log('\n--- EXAMPLE 2: Batch Insert ---');
    const runId = await exampleBatchInsert();

    // Example 3: Query recent
    console.log('\n--- EXAMPLE 3: Query Recent Activities ---');
    await exampleQueryRecent('user_demo_123', 10);

    // Example 4: Query interesting
    console.log('\n--- EXAMPLE 4: Query Interesting ---');
    await exampleQueryInteresting('user_demo_123');

    // Example 5: Query by run
    console.log('\n--- EXAMPLE 5: Query by Run ID ---');
    await exampleQueryByRun(runId);

    // Example 6: Query failed
    console.log('\n--- EXAMPLE 6: Query Failed Activities ---');
    await exampleQueryFailed('user_demo_123');

    // Example 7: Success rate
    console.log('\n--- EXAMPLE 7: Calculate Success Rate ---');
    await exampleSuccessRate('user_demo_123');

    // Example 8: Time range
    console.log('\n--- EXAMPLE 8: Query by Time Range ---');
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    await exampleQueryTimeRange('user_demo_123', oneDayAgo, Date.now());

    // Example 9: By action
    console.log('\n--- EXAMPLE 9: Query by Action Type ---');
    await exampleQueryByAction('user_demo_123', 'search_google_places');

    // Example 10: Average duration
    console.log('\n--- EXAMPLE 10: Average Duration by Action ---');
    await exampleAverageDuration('user_demo_123');

    // Example 11: Status breakdown
    console.log('\n--- EXAMPLE 11: Status Breakdown ---');
    await exampleStatusBreakdown('user_demo_123');

    // Example 12: Update status
    console.log('\n--- EXAMPLE 12: Update Activity Status ---');
    await exampleUpdateStatus(activityId, 'success', { updated: true }, null, 1500);

    // Example 13: Get interesting for email
    console.log('\n--- EXAMPLE 13: Get Interesting for Email ---');
    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
    await exampleGetInterestingForEmail('user_demo_123', yesterday);

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
