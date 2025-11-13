# Wyshbone Supervisor Integration Guide

## 🎯 Overview

This guide helps you integrate the Supervisor backend with Wyshbone's chat interface so users can ask for leads and receive real-time responses.

## ✅ What's Been Implemented

### 1. Supabase Client Service (`server/supabase-client.ts`)
- ✅ Server-side Supabase client using service-role key (secure)
- ✅ `createSupervisorTask()` - Create tasks for Supervisor to process
- ✅ `getSupervisorMessages()` - Fetch Supervisor responses
- ✅ `isSupabaseConfigured()` - Check if Supabase is configured
- ✅ TypeScript interfaces for `SupervisorTask` and `SupervisorMessage`

### 2. Intent Detection (`server/intent-detector.ts`)
- ✅ Keyword-based detection for lead generation ("find leads", "search for", etc.)
- ✅ Extracts business type and location from user messages
- ✅ Returns structured intent with task type and request data

### 3. SQL Migration Script (`SUPABASE_MIGRATIONS.sql`)
- ✅ Adds `source` and `metadata` columns to messages table
- ✅ Creates `supervisor_tasks` table
- ✅ Enables Realtime subscriptions on messages table
- ✅ Includes verification queries

## 🚀 Setup Instructions

### Step 1: Run SQL Migration on Supabase

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy and paste the contents of `SUPABASE_MIGRATIONS.sql`
4. Click **Run** to execute the migration
5. Verify by running the verification queries at the bottom of the file

### Step 2: Configure Environment Variables

Add these to your Replit Secrets or `.env` file:

```bash
# Your Supabase project URL
SUPABASE_URL=https://your-project.supabase.co

# Service role key (NOT the anon key) - find this in Supabase Settings > API
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Also needed for frontend realtime subscriptions
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **Important**: 
- Backend uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS, more privileges)
- Frontend uses `VITE_SUPABASE_ANON_KEY` (for realtime subscriptions only)

### Step 3: Restart Your Application

```bash
# The server will log:
✅ Supabase Supervisor client initialized
```

If you see:
```bash
⚠️ Supabase credentials not configured. Supervisor integration disabled.
```

Then check your environment variables.

### Step 4: Frontend Integration

✅ **COMPLETED** - Frontend realtime subscriptions are active:

**File:** `client/src/lib/supabase.ts`
- Supabase client initialized with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `subscribeSupervisorMessages()` function listens for new Supervisor responses
- Filters client-side for `source === 'supervisor'` messages only

**File:** `client/src/pages/chat.tsx` (lines 92-139)
- Subscribes to Supervisor messages using `subscribeSupervisorMessages()`
- Converts Supervisor messages to display format
- Shows toast notifications when responses arrive
- Auto-scrolls to new messages

### Step 5: Backend Intent Detection & Task Creation

✅ **COMPLETED** - Automatic Supervisor task creation on keywords:

**File:** `server/intent-detector.ts`
- Detects lead generation keywords ("find leads", "search for", etc.)
- Extracts business type and location from user messages
- Returns structured intent with task type and request data

**File:** `server/routes.ts` (in `/api/chat` endpoint)
- After user message is saved, checks for Supervisor intent
- If detected, creates task in Supabase via `createSupervisorTask()`
- Returns task ID to frontend for tracking

### Step 6: Context Sharing & Loop Prevention ⚠️ CRITICAL

This step explains **WHY** the architecture works and **HOW** to avoid infinite loops.

#### 🔄 Context Sharing: Why ALL Messages Must Be Visible to the AI

**Problem:** User asks Supervisor for leads, then follows up with "Tell me more about the first one."

If the regular AI can't see Supervisor's previous response, it has NO CONTEXT and will fail.

**Solution:** `server/memory.ts` → `loadConversationHistory()` (lines 262-347)

```typescript
// MERGES messages from BOTH databases
const allMessages = [
  ...localMessages,      // From local Postgres (UI messages)
  ...supervisorMessages  // From Supabase (Supervisor responses)
].sort((a, b) => a.createdAt - b.createdAt);

// TAGS Supervisor messages so AI knows who said what
if (msg.source === 'supervisor') {
  return {
    role: 'assistant',
    content: msg.content,
    name: 'Supervisor'  // ← OpenAI uses this to identify speaker
  };
}
```

**Result:** When building conversation context, the AI sees:

```
User: "Find dental clinics in York"
Assistant (Supervisor): "Here are 5 dental clinics in York: ..."
User: "Tell me more about the first one"  ← AI has full context!
```

#### 🔁 Loop Prevention: Why Not Every Message Triggers Supervisor

**Problem:** If EVERY user message creates a Supervisor task, you get infinite loops:

```
User: "Thanks!"
→ Creates Supervisor task (unnecessary)
Supervisor: "Here are leads for 'Thanks'..." (nonsense)
→ AI tries to respond
→ Creates ANOTHER task...
→ INFINITE LOOP 💥
```

**Solution:** `server/intent-detector.ts` uses **keyword matching**

```typescript
const LEAD_GENERATION_KEYWORDS = [
  'find lead', 'find prospect', 'search for', 'look for',
  'find business', 'generate lead', 'get lead',
  // ... only specific keywords
];

// Only returns requiresSupervisor: true if keywords match
if (hasLeadIntent) {
  return { requiresSupervisor: true, taskType: 'generate_leads' };
}
```

**Result:** Supervisor tasks are created ONLY when users explicitly ask for leads.

#### 🔀 Complete Flow: How It All Works Together

```
1. User: "Find cafes in Manchester"
   ↓
2. Frontend → POST /api/chat
   ↓
3. Backend detects keywords ("find", "cafes") → Creates Supervisor task
   ↓
4. Regular AI also responds: "Looking for cafes in Manchester..."
   ↓
5. Supervisor backend polls Supabase → Finds task
   ↓
6. Supervisor searches Google Places + Hunter.io
   ↓
7. Supervisor posts response to Supabase messages table
   ↓
8. Frontend realtime subscription receives it
   ↓
9. Displays Supervisor response with blue badge
   ↓
10. User: "Tell me more about the first one"
    ↓
11. Backend loads conversation history (INCLUDES Supervisor message!)
    ↓
12. Regular AI has full context and can answer intelligently
    ✅ NO new Supervisor task (no keywords detected)
```

**Key Insights:**
- ✅ Supervisor and regular AI work **together**, not against each other
- ✅ Context merging ensures **seamless conversation flow**
- ✅ Keyword detection prevents **unnecessary task creation**
- ✅ Users get **best of both worlds**: real-time research + conversational AI

## ✅ Integration Status: COMPLETE

All core integration tasks are finished! The Supervisor backend is fully integrated with Wyshbone.

### ✅ Completed Implementation

**Backend:**
- ✅ Supabase client service (`server/supabase-client.ts`)
- ✅ Intent detection with keyword matching (`server/intent-detector.ts`)
- ✅ Context merging from both databases (`server/memory.ts`)
- ✅ Automatic task creation in `/api/chat` endpoint (`server/routes.ts`)

**Frontend:**
- ✅ Supabase realtime subscriptions (`client/src/lib/supabase.ts`)
- ✅ Real-time message reception in chat UI (`client/src/pages/chat.tsx`)
- ✅ Supervisor message display with special styling
- ✅ Toast notifications for new responses
- ✅ Loading indicators during task processing

**Environment:**
- ✅ All 4 Supabase environment variables configured
- ✅ `.env.local` override file prevents caching issues
- ✅ Lazy initialization pattern for robust startup

### 🎯 Current Status

**Working Features:**
1. ✅ Users can type "Find cafes in Manchester" → Supervisor task created
2. ✅ Supervisor backend processes task → Posts response to Supabase
3. ✅ Frontend receives response via realtime subscription
4. ✅ AI can reference Supervisor responses in follow-up questions
5. ✅ No infinite loops (keyword detection prevents unnecessary tasks)

**Tested & Verified:**
- ✅ Environment variables loading correctly
- ✅ Supabase realtime connection status: `SUBSCRIBED`
- ✅ Message context merging working
- ✅ Intent detection triggering on keywords only

## 🧪 Testing Flow

1. **Send test message in chat:**
   ```
   Find dental clinics in York
   ```

2. **Expected behavior:**
   - Frontend detects keywords → calls `/api/supervisor/create-task`
   - Backend creates task in `supervisor_tasks` table
   - Supervisor backend (running separately) picks up task
   - Within 30 seconds, Supervisor posts response to `messages` table
   - Frontend realtime subscription receives new message
   - Message displays with blue "🤖 Supervisor" badge

3. **Verify in Supabase:**
   ```sql
   -- Check task was created
   SELECT * FROM supervisor_tasks ORDER BY created_at DESC LIMIT 1;

   -- Check Supervisor response
   SELECT * FROM messages WHERE source = 'supervisor' ORDER BY created_at DESC LIMIT 1;
   ```

## 📝 Architecture Notes

### Dual Database Setup
- **Local Postgres (Neon)**: Used for Wyshbone core data (conversations, facts, etc.)
- **Supabase (External)**: Used ONLY for Supervisor integration (tasks, responses)

This keeps Supervisor cleanly separated and allows it to run independently.

### Message Flow
```
User types message
    ↓
Frontend sends to /api/chat (normal flow)
    ↓
Backend detects Supervisor intent
    ↓
Creates task in Supabase supervisor_tasks table
    ↓
Supervisor backend polls for tasks
    ↓
Processes task (Google Places + Hunter.io)
    ↓
Posts response to Supabase messages table
    ↓
Frontend realtime subscription receives it
    ↓
Displays with Supervisor badge
```

## 🔒 Security

- Backend uses `SERVICE_ROLE_KEY` (full access, bypasses RLS)
- Frontend uses `ANON_KEY` (limited access, for subscriptions only)
- Never expose service role key in frontend code
- Consider adding RLS policies on `supervisor_tasks` table

## ⚠️ Known Limitations

### Intent Detection
The current keyword-based intent detection is simple but has limitations:
- May miss complex or multi-clause prompts
- Could false-trigger on unrelated messages containing keywords
- Doesn't handle all language variations (idioms, slang, typos)

**Recommended enhancements:**
- Add fallback to embedding similarity for ambiguous cases
- Implement user confirmation before creating tasks ("Did you mean to search for leads?")
- Add explicit "Ask Supervisor" button to avoid relying purely on detection

## 💡 Enhancement Ideas

- Add "Ask Supervisor" explicit button next to chat input (reduces reliance on keyword detection)
- Show Supervisor capabilities/status in UI
- Add Supervisor message history view
- Implement retry logic if Supervisor doesn't respond in 30s
- Add analytics for Supervisor usage
- Improve intent detection with NLP or embeddings

## 📚 Reference

See `INTEGRATION_INSTRUCTIONS_FOR_WYSHBONE_UI.md` in the Supervisor Replit for complete code examples and additional context.

---

**Need help?** Check the Supervisor backend logs to see if tasks are being processed, and verify Supabase tables have the correct structure.
