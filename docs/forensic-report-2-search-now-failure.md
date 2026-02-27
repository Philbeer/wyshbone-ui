# Forensic Report #2: "Search now" Still Loops / Fails to Execute

**Date:** 2026-02-27
**Scope:** Full trace of routing + clarify + run triggering for the conversation:
"Find pubs with live music" → "arundel" → "5 results" → "Search now"

---

## 1-Page Summary

- **The trigger phrase "Search now" DOES match correctly.** `isRunTrigger("Search now")` normalizes to `"search now"`, which is an exact match in `RUN_TRIGGER_PHRASES` (line 58, `clarifySession.ts`).
- **The clarify session correctly accumulates fields.** After "arundel" → `location="arundel"`. After "5 results" → `count="5"`. The confirmation summary is presented as expected.
- **The transition to `run_supervisor` IS triggered.** When user says "Search now", `handleClarifyResponse` returns `{ action: 'run_supervisor' }` (line 207-218, `clarifySession.ts`).
- **Task creation FAILS because `SUPABASE_URL` is not set.** `createSupervisorTask()` calls `ensureSupabaseClient()` which throws `"Supabase client not configured"` because `SUPABASE_URL` is missing from the environment. The catch block at `routes.ts:1406` converts this into: *"I can't run searches right now because the system is temporarily unavailable."*
- **The "Not Connected" indicator is the Xero integration badge**, not a backend or chat connection issue. It comes from `XeroStatusBadge.tsx` and `app-sidebar.tsx:1722`. The DevBanner (backend connectivity) shows ✅/❌ based on `/health` endpoint polling, which IS reachable.
- **The "Reply Search now to proceed" message is from the PREVIOUS turn** (after "5 results" filled the last required field). It is the confirmation summary, not a response to "Search now" itself.

**Root cause: `SUPABASE_URL` environment variable is not set**, so `createSupervisorTask` always throws. The clarify logic is correct; the execution backend is misconfigured.

---

## 2. State Machine (Current)

### States

| State | Entry Condition | Storage | Exits To |
|-------|----------------|---------|----------|
| **CHAT_INFO** | `decideChatMode` returns `CHAT_INFO` | No session created | Stays in CHAT_INFO (GPT streaming response) |
| **CLARIFY_FOR_RUN** | `decideChatMode` returns `CLARIFY_FOR_RUN` | In-memory `ClarifySession` created in `Map<conversationId, session>` | ask_more (loop) → CLARIFY_FOR_RUN; run_supervisor → RUN_SUPERVISOR; cancelled → CHAT_INFO |
| **Confirmation** (sub-state of CLARIFY_FOR_RUN) | All required fields filled + new data extracted | Session stays active, `pending_questions=[]`, `clarified_request_text` set | User says "Search now" / trigger → run_supervisor; User adds more data → stays in Confirmation |
| **RUN_SUPERVISOR** | `decideChatMode` returns `RUN_SUPERVISOR` directly, OR clarify session returns `run_supervisor` | Supervisor task row in `supervisor_tasks` table (Supabase) | Task created → response; Task fails → error message |

### Transitions

```
User message
    │
    ├─ Active ClarifySession exists? ──YES──→ [CLARIFY_GUARD]
    │                                          handleClarifyResponse()
    │                                           ├─ isUserCancelling? → cancelled
    │                                           ├─ isBareAck + allFieldsFilled? → run_supervisor
    │                                           ├─ isRunTrigger + allFieldsFilled? → run_supervisor
    │                                           ├─ !isMeaningful? → ask_more (re-prompt)
    │                                           └─ meaningful answer:
    │                                               ├─ missingParts=0 → ask_more (CONFIRMATION summary)
    │                                               └─ missingParts>0 → ask_more (next questions)
    │
    └─ No active session ──→ decideChatMode()
                              ├─ CHAT_INFO → GPT streaming
                              ├─ CLARIFY_FOR_RUN → createClarifySession()
                              └─ RUN_SUPERVISOR → createSupervisorTask()
```

### CLARIFY_GUARD Invariant (routes.ts:1287-1291)

When a clarify session is active, ALL messages route directly to `handleClarifyResponse`. No `decideChatMode` re-evaluation. No pivot-detection recheck. Only `handleClarifyResponse` may close sessions (via cancel or run_supervisor).

---

## 3. Clarify Session Persistence

### Storage

- **Location:** In-memory `Map<string, ClarifySession>` (`clarifySession.ts:37`)
- **Key:** `conversationId`
- **No database persistence.** Sessions are lost on server restart.
- **One session per conversation.** `createClarifySession` overwrites any previous session for the same `conversationId`.

### Session Object After Each Message

**After "Find pubs with live music."**
```json
{
  "id": "<generated>",
  "conversation_id": "<conv-id>",
  "is_active": true,
  "original_user_text": "Find pubs with live music.",
  "entity_type": "pubs with live music",
  "location": null,
  "semantic_constraint": null,
  "semantic_constraint_resolved": false,
  "pending_questions": ["Which location or area should I search in?"],
  "answers": {},
  "clarified_request_text": null
}
```
- `decideChatMode` classifies as `CLARIFY_FOR_RUN` (entity detected "pubs with live music", no location).
- `createClarifySession` called at `routes.ts:1553`.
- `buildInitialQuestions` returns `["Which location or area should I search in?"]`.

**After "arundel"**
```json
{
  "entity_type": "pubs with live music",
  "location": "arundel",
  "pending_questions": [],
  "answers": { "location": "arundel" },
  "clarified_request_text": "find pubs with live music in arundel"
}
```
- `CLARIFY_GUARD` routes to `handleClarifyResponse`.
- `isBareAcknowledgement("arundel")` → false.
- `isRunTrigger("arundel")` → false.
- `isMeaningfulClarificationAnswer("arundel", session)` → true (session.location is null).
- `parseAnswerContent`: `session.location` is null → short word (≤3 tokens) → `location = "arundel"`.
- `missingParts = []` (entity_type ✓, location ✓).
- Returns `ask_more` with **confirmation summary**: `"Got it — I'll search for **pubs with live music** in **arundel**.\n\nReply **Search now** to proceed, or add more details (e.g. number of results)."`

**After "5 results"**
```json
{
  "entity_type": "pubs with live music",
  "location": "arundel",
  "pending_questions": [],
  "answers": { "location": "arundel", "count": "5", "q_0": "5 results" },
  "clarified_request_text": "find 5 pubs with live music in arundel"
}
```
- `CLARIFY_GUARD` routes to `handleClarifyResponse`.
- `isBareAcknowledgement("5 results")` → false.
- `isRunTrigger("5 results")` → false.
- `isMeaningfulClarificationAnswer("5 results", session)` → true (entity_type and location are both set, so pure digit check at line 83-85 returns false, but it's not a bare ack either, so line 86 returns true).
- `parseAnswerContent`: `countMatch = "5"` → `answers.count = "5"`. `session.location` already set → location parsing skipped.
- `missingParts = []` (all filled).
- Returns `ask_more` with **confirmation summary**: `"Got it — I'll search for **5** **pubs with live music** in **arundel**.\n\nReply **Search now** to proceed, or add more details (e.g. number of results)."`

**After "Search now"**
```json
{
  "clarified_request_text": "find 5 pubs with live music in arundel",
  "pending_questions": []
}
```
- `CLARIFY_GUARD` routes to `handleClarifyResponse`.
- `isRunTrigger("Search now")` → normalized = `"search now"` → exact match in `RUN_TRIGGER_PHRASES` → **true**.
- `requiredAlreadyFilled` → `entity_type="pubs with live music"` ✓, `location="arundel"` ✓ → **true**.
- Returns `{ action: 'run_supervisor', clarifiedRequest: "find 5 pubs with live music in arundel" }`.
- **Session is NOT overwritten, duplicated, or reset** — the same session object is mutated in place via `updateClarifySession`.

---

## 4. Trigger Phrase Handling ("Search now")

### Implementation Location

`server/lib/clarifySession.ts`, lines 57-71:

```typescript
const RUN_TRIGGER_PHRASES = [
  'search now', 'run now', 'go now', 'start search', 'start now',
  'run search', 'do it now', 'execute', 'search now with defaults',
  'run it now', 'go for it now', 'let\'s search', 'begin search',
];

function isRunTrigger(message: string): boolean {
  const normalized = message.toLowerCase().trim().replace(/[.,!?;:]+$/, '');
  return RUN_TRIGGER_PHRASES.some(phrase =>
    normalized === phrase || normalized.startsWith(phrase)
  );
}
```

### Exact Matching Strings

| Input | Normalized | Matches? | Match Type |
|-------|-----------|----------|------------|
| `"Search now"` | `"search now"` | ✅ YES | exact match |
| `"Search now with defaults"` | `"search now with defaults"` | ✅ YES | exact match |
| `"search now!"` | `"search now"` | ✅ YES | punctuation stripped |
| `"Search Now"` | `"search now"` | ✅ YES | case-insensitive |
| `"SEARCH NOW"` | `"search now"` | ✅ YES | case-insensitive |

### Code Path for "Search now"

1. `isRunTrigger("Search now")` → `true` (line 70)
2. `requiredAlreadyFilled` → `true` (entity_type + location both set)
3. Line 207-218: `buildClarifiedRequest` called, session updated, returns `{ action: 'run_supervisor' }`
4. `routes.ts:1344`: `clarifyHandlerResult.action === 'run_supervisor'` → enters try block
5. `routes.ts:1352`: `detectSupervisorIntent(clarifiedRequest)` called
6. `routes.ts:1379`: `createSupervisorTask(...)` called → **THROWS**
7. `routes.ts:1406`: Catch block fires → "system temporarily unavailable"

---

## 5. Why Execution Fails ("system temporarily unavailable")

### The Exact Error

```
Supabase client not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
```

### Code Path

1. `createSupervisorTask()` (`supabase-client.ts:75`) calls `ensureSupabaseClient()` (line 82).
2. `ensureSupabaseClient()` (`supabase-client.ts:30`) calls `initializeSupabase()`.
3. `initializeSupabase()` reads `process.env.SUPABASE_URL` → **empty string** (not set).
4. Since `!SUPABASE_URL` is true, `supabase` remains `null`.
5. `ensureSupabaseClient()` throws: `"Supabase client not configured"`.

### Environment State (Verified)

| Variable | Status |
|----------|--------|
| `SUPABASE_URL` | **NOT SET** |
| `SUPABASE_SERVICE_ROLE_KEY` | SET |

**Both are required.** With `SUPABASE_URL` missing, the Supabase client never initializes. Every call to `createSupervisorTask` will throw.

### Which Catch Block?

The error message *"I can't run searches right now because the system is temporarily unavailable. Your clarification has been saved — just send any message to retry."* is produced at **`routes.ts:1408`** (the CLARIFY→RUN catch block).

There is a second, nearly identical catch block at **`routes.ts:1536`** for the direct RUN_SUPERVISOR path (non-clarify). Both produce "system temporarily unavailable" but with slightly different wording.

### It is NOT:

- ❌ `SUPERVISOR_BASE_URL` unreachable — supervisor task creation is a Supabase DB insert, not an HTTP call.
- ❌ SSE stream aborted / BodyStreamBuffer — the error occurs before any streaming starts.
- ❌ "Not Connected" UI state — this is the Xero integration badge, unrelated to chat.

---

## 6. Connection State ("Not Connected")

### What It Means

The "Not Connected" indicator in the top bar is the **Xero integration status badge**, NOT a backend connection indicator.

**Source:** `client/src/components/XeroStatusBadge.tsx:112` and `client/src/components/app-sidebar.tsx:1722`.

```tsx
// XeroStatusBadge.tsx:112
Not Connected

// app-sidebar.tsx:1722
{isConnected ? 'Connected' : 'Not connected'}
```

`isConnected` is determined by `connectedProviders.has(provider.key)` where `provider.key` is `'xero'`. It checks whether the user has a connected Xero OAuth integration.

### What Sets It

The Xero OAuth connection state. If the user hasn't connected Xero, it shows "Not Connected".

### Does It Block Supervisor Execution?

**No.** This is purely UI cosmetics for the Xero integration. It has zero connection to the chat routing, supervisor task creation, or SSE streaming.

### Backend Connection Status

The DevBanner (`DevBanner.tsx`) polls `http://localhost:5001/health` every 10 seconds. If it responds with `200`, the green checkmark shows. This is separate from the Xero badge.

---

## 7. Message-by-Message Trace Table

| # | User Message | router_decision | clarify_session_active | clarify_fields_present | attempted_supervisor_task? | result |
|---|-------------|----------------|----------------------|----------------------|--------------------------|--------|
| 1 | "Find pubs with live music." | `CLARIFY_FOR_RUN` | **Created** | `entity_type="pubs with live music"`, `location=null` | No | UI shows: "Which location or area should I search in?" |
| 2 | "arundel" | `CLARIFY_GUARD → ask_more` | Active | `entity_type="pubs with live music"`, `location="arundel"` | No | UI shows confirmation: "Reply **Search now** to proceed…" |
| 3 | "5 results" | `CLARIFY_GUARD → ask_more` | Active | `entity_type="pubs with live music"`, `location="arundel"`, `count="5"` | No | UI shows confirmation: "Reply **Search now** to proceed…" |
| 4 | "Search now" | `CLARIFY_GUARD → run_supervisor` | Closed (after task attempt) | All filled | **YES — FAILED** | `ensureSupabaseClient()` throws → catch → "system temporarily unavailable" |

---

## 8. Key Logs Excerpt

No chat-route logs are present in the current log window (the conversation occurred before the latest log rotation). However, based on code analysis, the following log lines WOULD be emitted:

```
[CLARIFY_GUARD] Active session <id> for conv=<conv> — routing directly to handleClarifyResponse
🚀 [CLARIFY→RUN] Session complete, creating supervisor task. clarifiedRequest="find 5 pubs with live music in arundel"
📦 [CLARIFY→SEARCH_QUERY] business_type="pubs with live music" location="arundel" requested_count=5
[CLARIFY→RUN_ERROR] Supabase client not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. — session preserved for retry
```

At startup, the following warning WOULD appear (if logs captured it):
```
⚠️ Supabase credentials not configured. Supervisor integration disabled.
   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable Supervisor.
```

---

## 9. Root Cause + Fix Direction

### Single Root Cause

**`SUPABASE_URL` environment variable is not set.** The clarify routing logic is correct — "Search now" matches the trigger, the session has all required fields, `handleClarifyResponse` correctly returns `run_supervisor`. But the very next step — `createSupervisorTask()` → `ensureSupabaseClient()` — throws because the Supabase client was never initialized due to the missing URL.

**File:** `server/supabase-client.ts`, lines 30-35 (`ensureSupabaseClient`).

### Fix Direction (No Implementation)

1. **Set `SUPABASE_URL` in the environment.** This is the only blocker. Once both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, `createSupervisorTask` will be able to insert into the `supervisor_tasks` table and the flow will complete.

2. **Optional improvement:** Add a pre-flight check at the START of the `run_supervisor` branch (both CLARIFY→RUN at line 1351 and direct RUN_SUPERVISOR at line 1430) that calls `isSupabaseConfigured()` before attempting task creation. If not configured, return a clear user-facing message ("Supervisor is not configured — please contact your administrator") instead of letting it throw through `ensureSupabaseClient()`. This would make the error message accurate instead of misleading ("temporarily unavailable" implies it might work later, when it won't without configuration).

3. **Session persistence caveat:** The "Your clarification has been saved" message in the error response is misleading — sessions are in-memory only (`Map<string, ClarifySession>`). A server restart will destroy them. If the user retries after a server restart, their session is gone.
