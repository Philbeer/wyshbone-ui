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

## 📋 Remaining Implementation Tasks

### Backend

- [ ] **Create POST /api/supervisor/create-task endpoint**
  - Accept: `{ message: string, conversationId: string }`
  - Detect intent using `detectSupervisorIntent(message)`
  - If intent detected, call `createSupervisorTask()`
  - Return: `{ taskCreated: boolean, taskId?: string }`

- [ ] **Add intent detection to message flow**
  - Option A: Call `/api/supervisor/create-task` from frontend after sending message
  - Option B: Add middleware to `/api/chat` endpoint to auto-detect Supervisor intents

### Frontend

- [ ] **Install Supabase client for browser**
  ```bash
  # Already installed: @supabase/supabase-js
  ```

- [ ] **Create Supabase realtime hook** (`client/src/lib/use-supervisor-realtime.ts`)
  ```typescript
  import { createClient } from '@supabase/supabase-js';
  import { useEffect } from 'react';

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  export function useSupervisorRealtime(conversationId: string, onMessage: (msg: any) => void) {
    useEffect(() => {
      const channel = supabase
        .channel(`conversation:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            if (payload.new.source === 'supervisor') {
              onMessage(payload.new);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [conversationId]);
  }
  ```

- [ ] **Add Supervisor message UI** in `client/src/pages/chat.tsx`
  - Detect messages with `source === 'supervisor'`
  - Add blue left border or gradient background
  - Show "🤖 Supervisor" badge
  - Display metadata chips (capabilities, lead count)
  - Add loading indicator while waiting for response

- [ ] **Call Supervisor on message send**
  - After user sends message, check if it contains lead keywords
  - Call POST `/api/supervisor/create-task`
  - Show "Supervisor is analyzing..." indicator
  - Wait for realtime response (max 30 seconds)

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
