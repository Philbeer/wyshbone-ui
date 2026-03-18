# Forensic Report: CLARIFY Session Loop Bug

## 1. Message-by-Message Trace

| # | User Message | `decideChatMode` Result | Clarify Session State After | Supervisor Task Created? |
|---|---|---|---|---|
| 1 | "Find pubs with live music." | **CLARIFY_FOR_RUN** (entity verb "find", entity="pubs with live music", no location) | **Created**: `entity_type="pubs with live music"`, `location=null`, pending_questions=["Which location?"] | No |
| 2 | "arundel" | **CHAT_INFO** (no entity verb, no entity noun, no informational prefix → fallback CHAT_INFO) | **Destroyed** by pivot-detection recheck at `routes.ts:1301-1303` | No |
| 3 | "5 results" | **CHAT_INFO** (no entity verb, no entity noun → fallback CHAT_INFO) | No session exists | No |
| 4 | "Search now with defaults" | **CLARIFY_FOR_RUN** (entity verb "search" detected, entity="now with defaults", no location) | **New session created**: `entity_type="now with defaults"`, `location=null`, pending_questions=["Which location?"] | No |

The user sees the location question **again** at step 4 — a full loop.

---

## 2. Clarify State Storage

**Where:** In-memory `Map<string, ClarifySession>` in `server/lib/clarifySession.ts:19`.
Key = `conversationId`, value = `ClarifySession` object.

**Fields written:**
- `entity_type`, `location`, `semantic_constraint` (extracted from messages)
- `answers` (`Record<string, string>` — keys like `location`, `entity_type`, `count`, `q_0`)
- `pending_questions` (array of question strings)
- `clarified_request_text` (final reconstructed query, only set on completion)
- `semantic_constraint_resolved` (boolean flag)

**Write path for "arundel":** The write path **never fires**. The session is destroyed before `handleClarifyResponse` can run. If it did run, `parseAnswerContent` (line 258-272) would correctly extract "arundel" as the location via the fallback rule: `!result.location && !countMatch && wordCount <= 3 → location = message.trim()`.

---

## 3. Clarify State Retrieval

**Where read:** `server/routes.ts:1295` — `getActiveClarifySession(conversationId)`.

**The retrieval succeeds.** On the "arundel" turn, line 1295 does return the active session. The session IS found. The problem is what happens next.

---

## 4. Root Cause: Pivot-Detection Recheck Destroys the Session

**File:** `server/routes.ts`, lines 1297–1309.

```typescript
if (activeClarifySession) {
    const recheckDecision = decideChatModeForRecheck({ userMessage: latestUserText });  // line 1299

    if (recheckDecision.mode === 'CHAT_INFO') {                                         // line 1301
        closeAllClarifySessions(conversationId);  // ← SESSION KILLED                  // line 1303
    } else if (recheckDecision.entityType &&
        recheckDecision.entityType.toLowerCase() !== ...) {
        closeAllClarifySessions(conversationId);
    }
}
```

**What happens step by step for "arundel":**

1. `getActiveClarifySession(conversationId)` → returns the active session (entity_type="pubs with live music", location=null). ✅
2. `decideChatModeForRecheck({ userMessage: "arundel" })` → "arundel" contains no entity-finding verb ("find", "search", etc.), no entity noun pattern, no informational prefix → falls through to the default return: `{ mode: 'CHAT_INFO', reason: 'No entity-finding intent detected' }`.
3. `recheckDecision.mode === 'CHAT_INFO'` → **true** → `closeAllClarifySessions(conversationId)` fires. The session is deleted from the in-memory Map.
4. Line 1311: `getActiveClarifySession(conversationId)` → returns **null** (session gone).
5. The `handleClarifyResponse` block (lines 1313-1427) is **skipped entirely**.
6. Execution falls through to the 3-way router (line 1432), which re-runs `decideChatMode("arundel")` → `CHAT_INFO` → GPT-5 streaming response.
7. GPT generates a freeform response (acknowledging Arundel, asking follow-ups) — this is why the user sees confirmation questions from GPT, not from the clarify session.

**The clarify session's `handleClarifyResponse` function would have worked perfectly:**
- `isMeaningfulClarificationAnswer("arundel", session)` → true (not a bare acknowledgement, not empty)
- `parseAnswerContent("arundel", session)` → `{ location: "arundel" }` (via fallback: ≤3 words, no count match)
- `missingParts` would be empty (entity_type already set, location now set)
- Result: `{ action: 'run_supervisor', clarifiedRequest: "find pubs with live music in arundel" }`

But it never gets the chance to run.

---

## 5. Why "Search now with defaults" Does Not Transition to RUN

**"Search now with defaults"** is re-routed through `decideChatMode` as a fresh message (no active session exists at this point):

1. The word "search" matches `ENTITY_FINDING_VERBS[6]` → entity intent detected.
2. Entity extraction: `/(?:find|...search...)\s+(.+?)(?:\s+(?:in|near|around|at)\s+|$)/i` matches "search **now with defaults**" → `entityType = "now with defaults"`.
3. Location: no `in/near/around` preposition → `location = undefined`.
4. `isRunnable("now with defaults", undefined)` → false (no location).
5. Result: `CLARIFY_FOR_RUN` with a brand-new session → asks "Which location?" again.

The phrase "defaults" is **not parsed anywhere**. There is no handler for "use defaults", "search now", or any phrase that means "proceed with what you already know". The system has no concept of default parameters or session resumption after a session has been destroyed.

---

## 6. Confirmation: No Supervisor Task During CLARIFY

- The `CLARIFY_FOR_RUN` lane (`routes.ts:1556-1594`) only creates a `ClarifySession` and sends SSE messages. No call to `createSupervisorTask`.
- The `ask_more` handler (`routes.ts:1342-1351`) sends a message and returns. No task creation.
- A supervisor task is only created at:
  - `routes.ts:1389` — when clarify handler returns `run_supervisor` (CLARIFY→RUN transition)
  - `routes.ts:1483` — when the 3-way router returns `RUN_SUPERVISOR` directly
- **No supervisor tasks are created during CLARIFY turns.** However, the CHAT_INFO fallback sends the message to GPT-5, which generates responses that may look like agent behavior to the user (asking questions, acknowledging information), creating the appearance of "forwarding to agent execution".

---

## 7. Single Root Cause

**The pivot-detection recheck (`routes.ts:1297-1309`) is fundamentally flawed.** It re-evaluates the user's bare reply through `decideChatMode`, which is designed to classify *initial* user intents, not follow-up answers to clarification questions. Any short, plain-text answer (a city name, a number, a preference) will lack entity-finding verbs and will therefore be classified as `CHAT_INFO`, causing the session to be destroyed.

This is not a persistence bug, a key mismatch, or a race condition. The clarify session storage, retrieval, and parsing all work correctly. The session is simply killed by a logic error in the pivot-detection guard before the parsing logic can run.

**The cascade:**
1. Pivot detection kills session on any non-entity reply → location/count answers are lost
2. GPT takes over, generating confusing responses that mimic agent behavior
3. User tries to re-trigger the search → "search" verb creates a new empty session → loop

---

## 8. Minimal Fix Direction (Report Only — Not Implemented)

The pivot-detection recheck at `routes.ts:1297-1309` should only close a session when it is confident the user has genuinely changed topic — not simply because the reply doesn't look like a standalone search command. Two possible approaches:

**Option A — Remove the CHAT_INFO pivot check entirely.** Only close the session if the user explicitly cancels (already handled by `isUserCancelling`) or if a distinctly *new* entity intent is detected with a *different* entity type (the second branch at line 1304-1307). A bare reply like "arundel" would always flow to `handleClarifyResponse`, which already handles garbage/irrelevant answers gracefully.

**Option B — Narrow the pivot check.** Instead of `recheckDecision.mode === 'CHAT_INFO'`, check for a positive signal that the user is pivoting (e.g., informational question prefixes like "what is", "how do", "tell me about"). This preserves the ability to break out of clarification while not destroying sessions on short factual answers.

Option A is simpler and lower-risk. The `handleClarifyResponse` function is already robust: it handles cancellation, bare acknowledgements, and builds next-questions for any still-missing fields. Letting it run for every reply during an active session is the intended design.
