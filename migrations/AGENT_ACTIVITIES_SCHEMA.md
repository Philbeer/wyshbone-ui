# Agent Activities Schema Documentation

## Overview

The `agent_activities` table stores all autonomous agent actions, enabling activity tracking, user notifications, and analytics. This table is the foundation for Phase 2's autonomous agent system.

## Table Schema

```sql
CREATE TABLE agent_activities (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  timestamp         BIGINT NOT NULL,
  task_generated    TEXT NOT NULL,
  action_taken      TEXT NOT NULL,
  action_params     JSONB,
  results           JSONB,
  interesting_flag  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL,
  error_message     TEXT,
  duration_ms       INTEGER,
  conversation_id   TEXT,
  run_id            TEXT,
  metadata          JSONB,
  created_at        BIGINT NOT NULL
);
```

## Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Unique identifier (e.g., `activity_1767993379920_abc123`) |
| `user_id` | TEXT | User who owns this activity |
| `timestamp` | BIGINT | Unix timestamp (ms) when activity occurred |
| `task_generated` | TEXT | Description of what the agent decided to do |
| `action_taken` | TEXT | Tool/action executed (e.g., `search_google_places`) |
| `action_params` | JSONB | Parameters passed to the action |
| `results` | JSONB | Results from action execution |
| `interesting_flag` | INTEGER | 1 if notable/interesting, 0 if routine |
| `status` | TEXT | `success`, `failed`, `pending`, `skipped` |
| `error_message` | TEXT | Error details if status=failed |
| `duration_ms` | INTEGER | How long the action took (milliseconds) |
| `conversation_id` | TEXT | Link to conversation if from chat flow |
| `run_id` | TEXT | Groups related activities into a single run |
| `metadata` | JSONB | Additional context (source, triggers, etc.) |
| `created_at` | BIGINT | Unix timestamp (ms) when record was created |

## Indexes

### Performance Optimizations

```sql
-- User activities by time (most common query)
CREATE INDEX agent_activities_user_id_timestamp_idx
  ON agent_activities(user_id, timestamp DESC);

-- Interesting activities for notifications
CREATE INDEX agent_activities_interesting_flag_idx
  ON agent_activities(interesting_flag, timestamp DESC)
  WHERE interesting_flag = 1;

-- Query by status
CREATE INDEX agent_activities_status_idx
  ON agent_activities(status, timestamp DESC);

-- Group by run
CREATE INDEX agent_activities_run_id_idx
  ON agent_activities(run_id, timestamp DESC)
  WHERE run_id IS NOT NULL;

-- Link to conversations
CREATE INDEX agent_activities_conversation_id_idx
  ON agent_activities(conversation_id)
  WHERE conversation_id IS NOT NULL;
```

## Common Query Patterns

### 1. Get Recent Activities for a User

```sql
SELECT * FROM agent_activities
WHERE user_id = 'user_123'
ORDER BY timestamp DESC
LIMIT 10;
```

**Use case:** Activity feed UI, user dashboard

**Index used:** `agent_activities_user_id_timestamp_idx`

### 2. Get Interesting Activities (Email Notifications)

```sql
SELECT * FROM agent_activities
WHERE user_id = 'user_123'
  AND interesting_flag = 1
  AND timestamp > (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000)
ORDER BY timestamp DESC;
```

**Use case:** Daily email digest of interesting findings

**Index used:** `agent_activities_interesting_flag_idx`

### 3. Get Activities by Run (Grouped Execution)

```sql
SELECT * FROM agent_activities
WHERE run_id = 'run_20260109_001'
ORDER BY timestamp ASC;
```

**Use case:** View all actions in a single autonomous run

**Index used:** `agent_activities_run_id_idx`

### 4. Activity Statistics

```sql
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN interesting_flag = 1 THEN 1 ELSE 0 END) as interesting,
  AVG(duration_ms) as avg_duration
FROM agent_activities
WHERE user_id = 'user_123'
  AND timestamp > (EXTRACT(EPOCH FROM NOW()) * 1000 - 604800000); -- Last 7 days
```

**Use case:** Analytics, performance monitoring

**Index used:** `agent_activities_user_id_timestamp_idx`

## Migration Management

### Apply Migration

```bash
node run-migration.js migrations/0001_create_agent_activities.sql
```

### Rollback Migration

```bash
node run-migration.js migrations/0001_rollback_agent_activities.sql
```

### Verify Schema

```bash
npx tsx test-agent-activities-schema.ts
```

## Example Usage

See `migrations/examples/agent-activities-examples.ts` for:
- Inserting activities
- Querying by user, run, status
- Computing statistics
- Updating activity status
- Data retention/cleanup

## Integration Points

### Phase 2 Components

| Component | Usage |
|-----------|-------|
| **Goal Generator** (p2-t2) | Writes generated tasks to `task_generated` |
| **Task Executor** (p2-t3) | Logs execution to `action_taken`, `results` |
| **Email Notifier** (p2-t4) | Reads `interesting_flag=1` activities |
| **Daily Cron** (p2-t5) | Creates run_id for grouped activities |
| **Activity Feed UI** (p2-t6) | Displays recent activities from this table |

### Phase 3 Components

| Component | Usage |
|-----------|-------|
| **Memory System** (p3-t1) | Reads activities for learning patterns |
| **Failure Categorizer** (p3-t2) | Analyzes `status=failed` records |
| **Error Reactor** (p3-t3) | Learns from error patterns |

## Design Decisions

### Why JSONB for params/results?

Flexibility - different tools have different schemas. JSONB allows:
- Schema evolution without migrations
- Rich queries (e.g., `results->'count'`)
- Compact storage for complex data

### Why BIGINT for timestamps?

JavaScript uses milliseconds, BIGINT handles it natively without conversion.

### Why interesting_flag as INTEGER?

Room for expansion (0=routine, 1=interesting, 2=critical, etc.)

### Why TEXT for IDs?

- Human-readable IDs for debugging
- UUID compatibility
- No auto-increment conflicts in distributed systems

## Performance Considerations

### Expected Load

- **Inserts:** 10-100/day per user (autonomous agent runs)
- **Reads:** Frequent (activity feed, dashboards)
- **Updates:** Rare (mostly append-only)

### Optimization Tips

1. **Partition by user_id** if scaling to 100k+ users
2. **Archive old data** (>90 days) to separate table
3. **Use partial indexes** for frequently filtered columns
4. **Batch inserts** when logging multiple activities

## Data Retention

Recommended: Keep 90 days of data in hot storage, archive older data.

```sql
-- Archive old activities
DELETE FROM agent_activities
WHERE timestamp < (EXTRACT(EPOCH FROM NOW()) * 1000 - 7776000000); -- 90 days
```

## Security

- **User isolation:** Always filter by `user_id`
- **Data access:** Activities visible only to owning user
- **PII:** Avoid storing sensitive info in action_params/results

## Testing

Run the test suite to verify:
```bash
npx tsx test-agent-activities-schema.ts
```

Expected output:
- ✅ Table exists
- ✅ All columns present
- ✅ All indexes created
- ✅ Insert/query operations work
- ✅ Rollback script exists

## Troubleshooting

### Migration fails with "relation already exists"

The table already exists. Either:
- Skip migration (table is already applied)
- Run rollback first: `node run-migration.js migrations/0001_rollback_agent_activities.sql`

### Slow queries on user activities

Check if index is being used:
```sql
EXPLAIN ANALYZE
SELECT * FROM agent_activities WHERE user_id = 'user_123' ORDER BY timestamp DESC LIMIT 10;
```

Should show: `Index Scan using agent_activities_user_id_timestamp_idx`

### JSONB queries are slow

Add GIN index for specific JSON paths if needed:
```sql
CREATE INDEX agent_activities_results_gin_idx ON agent_activities USING GIN (results);
```

## Future Enhancements

- [ ] Add `agent_version` column for A/B testing agents
- [ ] Add `cost_estimate` for budget tracking
- [ ] Add `feedback` column for user ratings
- [ ] Partition table by month for better performance

## Support

For issues or questions:
1. Check test output: `npx tsx test-agent-activities-schema.ts`
2. Review migration logs
3. Check database connection (DATABASE_URL env var)
4. See examples: `migrations/examples/agent-activities-examples.ts`
