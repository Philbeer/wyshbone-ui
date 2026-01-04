# Agent Activities Schema Documentation

## Overview

The `agent_activities` table stores all autonomous agent actions for tracking, analysis, and user notifications. This enables:

1. **Activity Tracking**: Record every action the autonomous agent takes
2. **Performance Analysis**: Analyze which actions are successful vs. failed
3. **User Notifications**: Identify "interesting" activities to notify users about
4. **Debugging**: Full audit trail of agent decisions and outcomes
5. **Learning**: Historical data for improving agent decision-making

---

## Table Schema

### Table: `agent_activities`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Unique identifier for the activity (UUID or custom ID) |
| `user_id` | TEXT | No | - | User who triggered or owns this agent activity |
| `timestamp` | BIGINT | No | - | Unix timestamp (milliseconds) when activity occurred |
| `task_generated` | TEXT | No | - | Description of task the agent decided to do |
| `action_taken` | TEXT | No | - | Action executed (tool name, API call, etc.) |
| `action_params` | JSONB | Yes | null | JSON parameters passed to the action |
| `results` | JSONB | Yes | null | JSON results from action execution |
| `interesting_flag` | INTEGER | No | 0 | 1 if interesting/notable, 0 if routine |
| `status` | TEXT | No | - | Activity status: 'success', 'failed', 'pending', 'skipped' |
| `error_message` | TEXT | Yes | null | Error details if status='failed' |
| `duration_ms` | INTEGER | Yes | null | Duration of action execution in milliseconds |
| `conversation_id` | TEXT | Yes | null | Link to conversation if part of chat flow |
| `run_id` | TEXT | Yes | null | Groups related activities into a single run |
| `metadata` | JSONB | Yes | null | Additional context (source, triggers, etc.) |
| `created_at` | BIGINT | No | - | Unix timestamp (milliseconds) when record was created |

---

## Indexes

The following indexes optimize common query patterns:

1. **`agent_activities_user_id_timestamp_idx`**
   - Columns: `(user_id, timestamp DESC)`
   - Purpose: Query activities by user, ordered by most recent first
   - Usage: `SELECT * FROM agent_activities WHERE user_id = ? ORDER BY timestamp DESC`

2. **`agent_activities_interesting_flag_idx`**
   - Columns: `(interesting_flag, timestamp DESC)` WHERE `interesting_flag = 1`
   - Purpose: Quickly find interesting activities (partial index)
   - Usage: `SELECT * FROM agent_activities WHERE interesting_flag = 1 ORDER BY timestamp DESC`

3. **`agent_activities_status_idx`**
   - Columns: `(status, timestamp DESC)`
   - Purpose: Query activities by status (e.g., find all failures)
   - Usage: `SELECT * FROM agent_activities WHERE status = 'failed' ORDER BY timestamp DESC`

4. **`agent_activities_run_id_idx`**
   - Columns: `(run_id, timestamp DESC)` WHERE `run_id IS NOT NULL`
   - Purpose: Group activities by run (partial index)
   - Usage: `SELECT * FROM agent_activities WHERE run_id = ? ORDER BY timestamp`

5. **`agent_activities_conversation_id_idx`**
   - Columns: `(conversation_id)` WHERE `conversation_id IS NOT NULL`
   - Purpose: Link activities to conversations (partial index)
   - Usage: `SELECT * FROM agent_activities WHERE conversation_id = ?`

---

## Field Descriptions

### Core Fields

**`task_generated`**: Human-readable description of what task the agent decided to perform.
- Examples:
  - "Search for craft breweries in Leeds"
  - "Send weekly report to user about new pubs"
  - "Generate personalized outreach email"

**`action_taken`**: The specific action/tool that was executed.
- Examples:
  - "search_google_places"
  - "batch_contact_finder"
  - "send_email_notification"
  - "update_scheduled_monitor"

**`action_params`**: JSON object containing parameters passed to the action.
```json
{
  "query": "craft breweries",
  "location": "Leeds",
  "maxResults": 20
}
```

**`results`**: JSON object containing results from the action.
```json
{
  "places_found": 25,
  "emails_sent": 12,
  "run_id": "research_abc123"
}
```

### Status Field

**Possible values:**
- `success`: Action completed successfully
- `failed`: Action failed with an error
- `pending`: Action is still running
- `skipped`: Action was skipped (e.g., rate limited, no data)

### Interesting Flag

**`interesting_flag`**: Boolean indicator (0 or 1) for filtering notable activities.

**When to mark as interesting (1):**
- Agent found significant new insights
- High-value contacts discovered
- Important errors or anomalies detected
- User-requested tasks completed
- Milestone achievements

**When to mark as routine (0):**
- Scheduled maintenance tasks
- Background polling/monitoring
- Routine data refreshes
- Empty/null results

### Grouping Fields

**`run_id`**: Groups multiple activities into a single logical run.
- Example: A daily agent run might have run_id `run_2026-01-04_user123`
- All activities in that run share the same run_id

**`conversation_id`**: Links activity to a specific chat conversation.
- Used when agent takes action as part of a user conversation
- Enables context tracking across conversations

---

## TypeScript Types

The schema includes auto-generated TypeScript types via Drizzle ORM:

```typescript
import {
  InsertAgentActivity,
  SelectAgentActivity,
  agentActivities
} from '@shared/schema';

// Insert type (for creating new records)
const newActivity: InsertAgentActivity = {
  id: 'activity_abc123',
  userId: 'user_xyz',
  timestamp: Date.now(),
  taskGenerated: 'Search for pubs in Manchester',
  actionTaken: 'search_google_places',
  actionParams: { query: 'pubs', location: 'Manchester' },
  results: { places_found: 30 },
  interestingFlag: 1,
  status: 'success',
  durationMs: 1250,
  runId: 'run_2026-01-04_morning',
  createdAt: Date.now()
};

// Select type (for reading records)
const activity: SelectAgentActivity = await db
  .select()
  .from(agentActivities)
  .where(eq(agentActivities.id, 'activity_abc123'))
  .limit(1);
```

---

## Common Query Patterns

### 1. Get Recent Activities for a User
```typescript
import { desc, eq } from 'drizzle-orm';
import { agentActivities } from '@shared/schema';

const recentActivities = await db
  .select()
  .from(agentActivities)
  .where(eq(agentActivities.userId, userId))
  .orderBy(desc(agentActivities.timestamp))
  .limit(50);
```

### 2. Get Interesting Activities Only
```typescript
const interestingActivities = await db
  .select()
  .from(agentActivities)
  .where(
    and(
      eq(agentActivities.userId, userId),
      eq(agentActivities.interestingFlag, 1)
    )
  )
  .orderBy(desc(agentActivities.timestamp))
  .limit(10);
```

### 3. Get Activities for a Specific Run
```typescript
const runActivities = await db
  .select()
  .from(agentActivities)
  .where(eq(agentActivities.runId, runId))
  .orderBy(agentActivities.timestamp);
```

### 4. Get Failed Activities for Debugging
```typescript
const failedActivities = await db
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
```

### 5. Get Activity Success Rate
```typescript
import { count, sql } from 'drizzle-orm';

const stats = await db
  .select({
    total: count(),
    successful: sql<number>`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
    successRate: sql<number>`
      ROUND(
        100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*),
        2
      )
    `
  })
  .from(agentActivities)
  .where(eq(agentActivities.userId, userId));
```

---

## Migration Instructions

### Apply Migration

**Using Drizzle Kit (recommended):**
```bash
# If DATABASE_URL is set
npm run db:push
```

**Using psql:**
```bash
psql $DATABASE_URL < migrations/0001_create_agent_activities.sql
```

**Using Node.js:**
```typescript
import { sql } from 'drizzle-orm';
import { db } from './server/storage';
import fs from 'fs';

const migration = fs.readFileSync(
  'migrations/0001_create_agent_activities.sql',
  'utf-8'
);

await db.execute(sql.raw(migration));
console.log('✅ Migration applied successfully');
```

### Verify Migration

```sql
-- Check table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'agent_activities'
);

-- Check columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agent_activities'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'agent_activities';
```

### Rollback Migration

**Using psql:**
```bash
psql $DATABASE_URL < migrations/0001_rollback_agent_activities.sql
```

**Using Node.js:**
```typescript
import { sql } from 'drizzle-orm';
import { db } from './server/storage';
import fs from 'fs';

const rollback = fs.readFileSync(
  'migrations/0001_rollback_agent_activities.sql',
  'utf-8'
);

await db.execute(sql.raw(rollback));
console.log('✅ Rollback completed successfully');
```

---

## Example: Logging Agent Activity

```typescript
import { agentActivities, type InsertAgentActivity } from '@shared/schema';
import { storage } from './server/storage';

async function logAgentActivity(params: {
  userId: string;
  taskDescription: string;
  actionName: string;
  actionParams: Record<string, any>;
  results?: Record<string, any>;
  isInteresting?: boolean;
  runId?: string;
  conversationId?: string;
}): Promise<void> {
  const activityId = `activity_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const now = Date.now();

  const activity: InsertAgentActivity = {
    id: activityId,
    userId: params.userId,
    timestamp: now,
    taskGenerated: params.taskDescription,
    actionTaken: params.actionName,
    actionParams: params.actionParams,
    results: params.results || null,
    interestingFlag: params.isInteresting ? 1 : 0,
    status: params.results ? 'success' : 'pending',
    errorMessage: null,
    durationMs: null,
    conversationId: params.conversationId || null,
    runId: params.runId || null,
    metadata: {
      source: 'autonomous_agent',
      version: '1.0'
    },
    createdAt: now
  };

  // Insert into database
  await storage.db.insert(agentActivities).values(activity);

  console.log(`✅ Logged agent activity: ${activityId}`);
}

// Usage example
await logAgentActivity({
  userId: 'user_123',
  taskDescription: 'Search for craft breweries in Leeds',
  actionName: 'search_google_places',
  actionParams: {
    query: 'craft breweries',
    location: 'Leeds',
    maxResults: 20
  },
  results: {
    places_found: 25,
    execution_time_ms: 1250
  },
  isInteresting: true, // Found many results
  runId: 'run_2026-01-04_morning'
});
```

---

## Best Practices

### 1. Always Set Status
Update status from 'pending' to 'success' or 'failed' when action completes.

### 2. Log Execution Time
Always set `duration_ms` to help identify performance issues.

### 3. Use Run IDs
Group related activities with the same `run_id` for easier analysis.

### 4. Be Selective with Interesting Flag
Only mark truly notable activities as interesting (aim for <20% interesting rate).

### 5. Include Error Details
Always set `error_message` when status is 'failed' for debugging.

### 6. Use Metadata
Store additional context in `metadata` field (source, version, triggers, etc.).

### 7. Clean Up Old Data
Periodically archive or delete activities older than retention period.

---

## Performance Considerations

1. **Batch Inserts**: When logging multiple activities, use batch inserts:
   ```typescript
   await db.insert(agentActivities).values([activity1, activity2, activity3]);
   ```

2. **Limit Result Size**: Use `.limit()` on queries to prevent loading too much data

3. **Use Partial Indexes**: Interesting and run_id indexes are partial (WHERE clauses)

4. **Archive Old Data**: Consider moving activities older than 90 days to archive table

5. **Monitor Index Usage**: Check `pg_stat_user_indexes` to ensure indexes are being used

---

## Troubleshooting

### Migration Fails with "relation already exists"
- The table was already created. Check with:
  ```sql
  \dt agent_activities
  ```
- If table exists, skip migration or use `CREATE TABLE IF NOT EXISTS`

### Queries are slow
- Check if indexes exist: `\di agent_activities*`
- Analyze query plan: `EXPLAIN ANALYZE SELECT ...`
- Consider adding composite indexes for your specific query patterns

### JSONB queries are slow
- Use GIN indexes for JSONB columns if needed:
  ```sql
  CREATE INDEX ON agent_activities USING GIN (action_params);
  ```

---

## Future Enhancements

Potential future improvements to consider:

1. **Partitioning**: Partition table by timestamp for better performance
2. **Archiving**: Automatic archiving of old activities
3. **Aggregates**: Materialized view for common statistics
4. **Full-Text Search**: GIN index on text fields for searching
5. **Notifications**: Trigger-based notifications for interesting activities

---

**Last Updated:** 2026-01-04
**Version:** 1.0
**Migration:** `0001_create_agent_activities.sql`
