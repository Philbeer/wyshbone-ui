# Wyshbone Tool Architecture Analysis

This document provides a comprehensive analysis of Wyshbone's 5 core tools, documenting how they're invoked, their parameters, and integration points.

---

## Table of Contents
1. [Supervisor Location & Architecture](#supervisor-location--architecture)
2. [Tool 1: Deep Research](#tool-1-deep-research)
3. [Tool 2: Quick Search (Global Database)](#tool-2-quick-search-global-database)
4. [Tool 3: Email Finder (Batch Contact Finder)](#tool-3-email-finder-batch-contact-finder)
5. [Tool 4: Scheduled Monitoring](#tool-4-scheduled-monitoring)
6. [Tool 5: Nudges](#tool-5-nudges)
7. [Shared Action Execution Layer](#shared-action-execution-layer)
8. [Chat Integration Points](#chat-integration-points)

---

## Supervisor Location & Architecture

### Location
- **Main File:** `supervisor/server/supervisor.ts`
- **Action Registry:** `supervisor/server/actions/registry.ts`
- **Action Executors:** `supervisor/server/actions/executors.ts`

### How it Decides Which Tool to Use

The Supervisor uses a task-based architecture with these task types:

```typescript
// Task types defined in supervisor
type TaskType = 
  | 'generate_leads'      // → Uses Google Places + Email Finder
  | 'find_prospects'      // → Uses Global Database search
  | 'analyze_conversation' // → Uses conversation analysis
  | 'provide_insights';   // → Uses user context analysis
```

**Decision Flow:**
1. Chat message arrives at `/api/chat` endpoint
2. GPT analyzes user intent and conversation context
3. Based on intent, either:
   - Executes tools directly via `server/lib/actions.ts`
   - Creates a `supervisor_task` in Supabase for async processing
4. Supervisor polls `supervisor_tasks` table every 30 seconds
5. Processes tasks based on `task_type` field

### Parameter Extraction

Parameters are extracted from user messages using GPT with structured prompts:

```typescript
// From shared/conversationConfig.ts
const WyshboneChatConfig = {
  systemPrompt: `
    Use **deep_research** immediately when user intent matches:
    - "research", "investigate", "deep dive", "analysis", "comprehensive"
    
    Use **search_google_places** immediately when:
    - user wants quick lists: "find pubs in X", "coffee shops in Y"
    
    Use **saleshandy_batch_call** immediately when:
    - user wants emails, contacts, outreach
    
    Use **create_scheduled_monitor** immediately when:
    - user asks anything involving "weekly", "monitor", "track", "automatic"
  `
};
```

---

## Tool 1: Deep Research

### Invocation
- **File:** `server/deepResearch.ts`
- **Function:** `startBackgroundResponsesJob()`
- **API Endpoint:** `POST /api/deep-research`
- **Triggered by:** Chat (direct), UI button, Scheduled Monitors

### Required Parameters

```typescript
interface DeepResearchCreateRequest {
  prompt: string;           // required - The research query/topic
  label?: string;           // optional - Display name (defaults to prompt)
  mode?: 'report' | 'json'; // optional - Output format, default: 'report'
  counties?: string[];      // optional - Geographic regions to focus on
  windowMonths?: number;    // optional - Time window for dated evidence
  schemaName?: string;      // optional - JSON schema name (for mode='json')
  schema?: object;          // optional - JSON schema (for mode='json')
  intensity?: 'standard' | 'ultra'; // optional - Research depth, default: 'standard'
}
```

### Example Calls

```typescript
// Minimal example
const run = await startBackgroundResponsesJob({
  prompt: "pubs in Manchester UK"
});

// Full example
const run = await startBackgroundResponsesJob({
  prompt: "Research the craft beer market in West Sussex",
  label: "West Sussex Craft Beer Analysis",
  mode: "report",
  counties: ["West Sussex"],
  windowMonths: 6,
  intensity: "ultra"
}, sessionId, userId);

// Via API
await fetch('/api/deep-research', {
  method: 'POST',
  body: JSON.stringify({
    prompt: "coffee shops in London",
    label: "London Coffee Shops",
    intensity: "standard"
  })
});
```

### Response Format

```typescript
interface DeepResearchRun {
  id: string;              // Run ID (e.g., "run_abc123xyz")
  userId: string;          // User who initiated
  sessionId?: string;      // Chat session ID
  label: string;           // Display label
  prompt: string;          // Original query
  mode: 'report' | 'json';
  counties?: string[];
  windowMonths?: number;
  intensity: 'standard' | 'ultra';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped';
  responseId?: string;     // OpenAI Responses API ID
  outputText?: string;     // Final markdown report
  error?: string;          // Error message if failed
  createdAt: number;       // Timestamp
  updatedAt: number;
}
```

### Current UI Location
- **Component:** `client/src/pages/chat.tsx`
- **Sidebar:** `client/src/components/WishboneSidebar.tsx`
- **Parameter Collection:** Via natural language in chat, extracted by GPT
- **Trigger:** User says "research", "investigate", "deep dive", etc.

### Typical Duration
- **Standard:** 30-90 seconds
- **Ultra:** 2-8 minutes (multiple passes)
- **Asynchronous:** Uses OpenAI Responses API with background mode

---

## Tool 2: Quick Search (Global Database)

### Invocation
- **File:** `server/lib/actions.ts`
- **Function:** `executeAction({ action: 'SEARCH_PLACES', ... })`
- **API Endpoint:** `POST /api/places/search`
- **Triggered by:** Chat (direct), UI button

### Required Parameters

```typescript
interface SearchPlacesParams {
  query: string;           // required - Business type (e.g., "pubs", "breweries")
  location?: string;       // optional - Location text (e.g., "Manchester")
  locationText?: string;   // optional - Alternative location field
  country?: string;        // optional - ISO country code, default: "GB"
  maxResults?: number;     // optional - Max results, default: 30
  lat?: number;            // optional - Latitude for precise location
  lng?: number;            // optional - Longitude for precise location
  radiusMeters?: number;   // optional - Search radius
}
```

### Example Calls

```typescript
// Minimal example
const result = await executeAction({
  action: 'SEARCH_PLACES',
  params: { query: 'breweries' }
});

// Full example
const result = await executeAction({
  action: 'SEARCH_PLACES',
  params: {
    query: 'craft breweries',
    location: 'Manchester',
    country: 'GB',
    maxResults: 50
  },
  userId: 'user123'
});

// Via API
await fetch('/api/places/search', {
  method: 'POST',
  body: JSON.stringify({
    query: 'pubs',
    locationText: 'London',
    maxResults: 30
  })
});
```

### Response Format

```typescript
interface SearchPlacesResponse {
  ok: boolean;
  data: {
    places: Array<{
      place_id: string;
      name: string;
      address: string;
      phone?: string;
      website?: string;
      rating?: number;
      lat?: number;
      lng?: number;
    }>;
    count: number;
    query: string;
    location: string;
    country: string;
  };
  note?: string;  // Summary message
}
```

### Current UI Location
- **Component:** `client/src/pages/chat.tsx`
- **Parameter Collection:** Natural language extraction
- **Trigger:** User says "find", "search", "get Place IDs", "quick search"

### Typical Duration
- **Synchronous:** 1-5 seconds
- Returns immediately with results

---

## Tool 3: Email Finder (Batch Contact Finder)

### Invocation
- **File:** `server/lib/actions.ts`
- **Function:** `executeAction({ action: 'BATCH_CONTACT_FINDER', ... })`
- **Supervisor:** `supervisor/server/actions/executors.ts` → `runEmailFinderBatch()`
- **API Endpoint:** `POST /api/batch/create`
- **Triggered by:** Chat (direct), UI button

### Required Parameters

```typescript
interface BatchContactFinderParams {
  query: string;            // required - Business type
  location: string;         // required - Location to search
  country?: string;         // optional - ISO country code, default: "GB"
  targetRole?: string;      // optional - Job title to find, default: "General Manager"
  limit?: number;           // optional - Max businesses, default: 30
}

// For direct email enrichment (Supervisor)
interface EmailFinderParams {
  leads: Array<{
    name: string;
    domain: string;
    address?: string;
  }>;
  userId: string;
}
```

### Example Calls

```typescript
// Minimal example (via actions)
const result = await executeAction({
  action: 'BATCH_CONTACT_FINDER',
  params: {
    query: 'pubs',
    location: 'Manchester'
  },
  userId: 'user123',
  storage: storageInstance
});

// Full example
const result = await executeAction({
  action: 'BATCH_CONTACT_FINDER',
  params: {
    query: 'craft breweries',
    location: 'Yorkshire',
    country: 'GB',
    targetRole: 'Owner',
    limit: 50
  },
  userId: 'user123',
  storage: storageInstance
});

// Via Supervisor executors (direct email enrichment)
const result = await runEmailFinderBatch({
  leads: [
    { name: 'Red Lion Brewery', domain: 'redlionbrewery.com' },
    { name: 'Crown Ales', domain: 'crownales.co.uk' }
  ],
  userId: 'user123'
});

// Via API
await fetch('/api/batch/create', {
  method: 'POST',
  body: JSON.stringify({
    query: 'pubs',
    location: 'London',
    targetRole: 'General Manager',
    limit: 30
  })
});
```

### Response Format

```typescript
interface BatchJobResponse {
  ok: boolean;
  data: {
    batchId: string;       // Job ID for tracking
    status: 'running' | 'completed' | 'failed';
    viewUrl: string;       // URL to view progress
  };
  note: string;            // Detailed pipeline description
}

// After completion
interface BatchJobResult {
  items: Array<{
    business_name: string;
    address: string;
    domain: string;
    emails: string[];
    contact_name?: string;
    contact_role?: string;
    personal_line?: string;  // AI-generated outreach intro
  }>;
  created: any[];          // Successfully added to SalesHandy
  skipped: any[];          // Skipped (no email, duplicate, etc.)
}
```

### Current UI Location
- **Component:** `client/src/pages/chat.tsx`
- **Batch History:** `client/src/pages/batch-history.tsx`
- **Parameter Collection:** Natural language extraction
- **Trigger:** User says "find emails", "get contacts", "email finder", "outreach"

### Typical Duration
- **Asynchronous:** 30 seconds to 5 minutes depending on result count
- Returns immediately with batchId, processes in background

### Pipeline Steps
1. ✅ Search Google Places (up to 60 results with page tokens)
2. 🌐 Find website domains for each business
3. 📧 Discover verified emails via Hunter.io
4. 🎯 Rank contacts by position (targetRole prioritized)
5. ✍️ Generate AI-powered personalized outreach
6. 📤 Add prospects to SalesHandy campaign

---

## Tool 4: Scheduled Monitoring

### Invocation
- **File:** `server/lib/actions.ts`
- **Function:** `executeAction({ action: 'CREATE_SCHEDULED_MONITOR', ... })`
- **Executor:** `server/monitor-executor.ts` → `executeMonitorAndNotify()`
- **API Endpoint:** `POST /api/scheduled-monitors`
- **Triggered by:** Chat (direct), UI form

### Required Parameters

```typescript
interface CreateScheduledMonitorParams {
  label: string;            // required - Monitor name
  description?: string;     // optional - What to monitor (becomes research prompt)
  schedule?: 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly'; // default: 'weekly'
  scheduleDay?: number;     // optional - Day of week (0-6, 0=Sunday)
  scheduleTime?: string;    // optional - Time in HH:MM format, default: '09:00'
  monitorType?: 'deep_research' | 'business_search' | 'place_search'; // default: 'deep_research'
  config?: object;          // optional - Additional configuration
  emailAddress?: string;    // optional - Email for notifications
}
```

### Example Calls

```typescript
// Minimal example
const result = await executeAction({
  action: 'CREATE_SCHEDULED_MONITOR',
  params: {
    label: 'New pubs in Manchester'
  },
  userId: 'user123',
  storage: storageInstance
});

// Full example
const result = await executeAction({
  action: 'CREATE_SCHEDULED_MONITOR',
  params: {
    label: 'Weekly Brewery Openings',
    description: 'Research new brewery openings in West Sussex',
    schedule: 'weekly',
    scheduleDay: 1,  // Monday
    scheduleTime: '08:00',
    monitorType: 'deep_research',
    emailAddress: 'user@example.com'
  },
  userId: 'user123',
  storage: storageInstance
});

// Via API
await fetch('/api/scheduled-monitors', {
  method: 'POST',
  body: JSON.stringify({
    label: 'Track competitors',
    description: 'Monitor new competitors in London craft beer market',
    schedule: 'weekly',
    scheduleTime: '09:00',
    emailNotifications: 1
  })
});
```

### Response Format

```typescript
interface ScheduledMonitorResponse {
  ok: boolean;
  data: {
    monitor: {
      id: string;
      label: string;
      schedule: string;
      nextRunAt: number;   // Timestamp of next execution
    };
  };
  note: string;            // Confirmation message
}

// Monitor execution result (from monitor-executor.ts)
interface MonitorExecutionResult {
  totalResults: number;    // Total venues found
  newResults: number;      // New venues since last run
  summary: string;         // Teaser text
  fullOutput: string;      // Full research report
  runId: string;           // Deep research run ID
  agenticAnalysis?: {      // AI analysis of results
    significance: 'high' | 'medium' | 'low';
    requiresDeepDive: boolean;
    urgency: 'immediate' | 'normal';
    keyFindings: string[];
  };
}
```

### Current UI Location
- **List Component:** `server/routes.ts` → `/api/scheduled-monitors/:userId`
- **Parameter Collection:** Natural language or form input
- **Trigger:** User says "monitor", "schedule", "weekly", "track", "automate"

### Typical Duration
- **Creation:** Instant
- **Execution:** 30 seconds to 8 minutes (runs Deep Research internally)
- **Schedule:** Runs automatically based on schedule

### Features
- **Trend Detection:** Compares current vs. historical results
- **Agentic Analysis:** GPT-4 analyzes significance and suggests deep dives
- **Autonomous Deep Dives:** Can trigger follow-up research automatically
- **Email Notifications:** Sends formatted reports via Resend

---

## Tool 5: Nudges

### Invocation
- **File:** `client/src/features/subconscious/useNudges.ts`
- **Types:** `client/src/features/subconscious/types.ts`
- **Table:** `subcon_nudges` (Supabase)
- **Triggered by:** Supervisor generates nudges, UI displays them

### Nudge Types

```typescript
type NudgeType = 
  | 'follow_up'      // Lead needs follow-up
  | 'stale_lead'     // Lead has gone cold
  | 'engagement'     // Opportunity to engage
  | 'reminder'       // User-created reminder
  | 'insight';       // AI-generated insight

type NudgeStatus = 'new' | 'seen' | 'handled' | 'dismissed' | 'snoozed';
```

### Data Structure

```typescript
interface SubconNudge {
  id: string;
  title: string;              // Short, actionable title
  summary: string;            // Explanation of why nudge was generated
  createdAt: string;          // ISO timestamp
  status: NudgeStatus;
  type: NudgeType;
  importanceScore?: number;   // 0-100 (higher = more important)
  leadId?: string;            // Associated lead
  leadName?: string;          // Lead name for display
  remindAt?: string;          // When to resurface (if snoozed)
  metadata?: Record<string, unknown>;
}
```

### API Endpoints

```typescript
// Nudge actions (via Supervisor API)
POST /api/subcon/nudge/:id/dismiss  // Mark as dismissed
POST /api/subcon/nudge/:id/snooze   // Snooze with remindAt time

// Request body for snooze
{
  id: string;
  remind_at: string;  // ISO timestamp, default: 24 hours from now
}
```

### Example Calls

```typescript
// From useNudges hook
const { nudges, dismissNudge, snoozeNudge } = useNudges();

// Dismiss a nudge
await dismissNudge('nudge-123');

// Snooze a nudge (defaults to 24 hours)
await snoozeNudge('nudge-123');

// Snooze with custom time
await snoozeNudge('nudge-123', new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString());
```

### Current UI Location
- **Page:** `client/src/pages/nudges.tsx`
- **Components:** `client/src/features/subconscious/components/`
- **Parameter Collection:** N/A (nudges are generated by Supervisor)

### Typical Duration
- **Read:** Instant (direct Supabase query)
- **Actions:** < 1 second

### Features
- **Realtime Updates:** Supabase realtime subscriptions
- **Sorting:** By importance score (descending), then by date
- **Optimistic Updates:** UI updates immediately, reverts on error

---

## Shared Action Execution Layer

### Location
- **File:** `server/lib/actions.ts`

### Purpose
Provides a unified execution layer used by both:
- **Standard Mode:** Streaming chat responses
- **MEGA Mode:** Structured JSON responses

### Supported Actions

```typescript
type SupportedAction = 
  | 'SEARCH_PLACES'           // alias: 'search_wyshbone_database'
  | 'DEEP_RESEARCH'           // alias: 'deep_research'
  | 'BATCH_CONTACT_FINDER'    // alias: 'batch_contact_finder'
  | 'DRAFT_EMAIL'             // alias: 'draft_email'
  | 'CREATE_SCHEDULED_MONITOR'; // alias: 'create_scheduled_monitor'
```

### Unified Response Format

```typescript
interface ActionResult {
  ok: boolean;
  data?: any;
  note?: string;   // Human-readable summary
  error?: string;  // Error message if failed
}
```

---

## Chat Integration Points

### Main Chat Route
- **File:** `server/routes.ts` → `POST /api/chat`
- **Chat Page:** `client/src/pages/chat.tsx`

### How Chat Triggers Tools

1. **User sends message** to `/api/chat`
2. **GPT analyzes intent** using `WyshboneChatConfig.systemPrompt`
3. **Tool invocation** happens via:
   - Direct execution in streaming response
   - `function_call` in GPT response
   - MEGA mode's `suggested_actions` array

### Available Chat Tools (GPT Function Calls)

```typescript
// From conversationConfig.ts
const availableTools = [
  'deep_research',           // Comprehensive research
  'search_google_places',    // Quick business search
  'saleshandy_batch_call',   // Email finder + SalesHandy
  'create_scheduled_monitor' // Set up recurring monitoring
];
```

### Integration with Agent-First UI

For the new intelligent chat interface, tool calls should flow through:

1. **Intent Detection:** Use GPT to understand user intent
2. **Parameter Extraction:** Parse natural language to structured params
3. **Tool Selection:** Match intent to appropriate tool
4. **Execution:** Call via `executeAction()` from `server/lib/actions.ts`
5. **Result Display:** Stream or display results in chat

### Recommended Approach for Intelligent Chat

```typescript
// Example integration pattern
import { executeAction } from './lib/actions';

async function processUserMessage(message: string, context: any) {
  // 1. Use GPT to detect intent and extract params
  const intent = await detectIntent(message, context);
  
  // 2. Execute appropriate tool
  let result;
  switch (intent.tool) {
    case 'quick_search':
      result = await executeAction({
        action: 'SEARCH_PLACES',
        params: intent.params,
        userId: context.userId
      });
      break;
      
    case 'deep_research':
      result = await executeAction({
        action: 'DEEP_RESEARCH',
        params: intent.params,
        userId: context.userId
      });
      break;
      
    case 'email_finder':
      result = await executeAction({
        action: 'BATCH_CONTACT_FINDER',
        params: intent.params,
        userId: context.userId,
        storage: context.storage
      });
      break;
      
    case 'scheduled_monitor':
      result = await executeAction({
        action: 'CREATE_SCHEDULED_MONITOR',
        params: intent.params,
        userId: context.userId,
        storage: context.storage
      });
      break;
  }
  
  // 3. Return result for display
  return result;
}
```

---

## Summary Table

| Tool | Primary File | API Endpoint | Async | Typical Duration |
|------|-------------|--------------|-------|------------------|
| Deep Research | `server/deepResearch.ts` | `POST /api/deep-research` | Yes | 30s - 8min |
| Quick Search | `server/lib/actions.ts` | `POST /api/places/search` | No | 1-5s |
| Email Finder | `server/lib/actions.ts` | `POST /api/batch/create` | Yes | 30s - 5min |
| Scheduled Monitor | `server/lib/actions.ts` | `POST /api/scheduled-monitors` | No* | Instant |
| Nudges | `client/src/features/subconscious/` | Supabase direct | No | Instant |

*Monitor creation is instant; execution runs on schedule.

---

## Next Steps

1. **Phase 2:** Build intelligent chat interface using this analysis
2. Create `AgentToolService.ts` that wraps `executeAction()`
3. Add intent detection layer using GPT
4. Implement tool status UI components
5. Test all tool invocations via chat

---

*Last updated: December 2024*


