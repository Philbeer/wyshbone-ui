# Xero Connect Initiation Fix

## Root Cause

The "Failed to initiate OAuth flow" error occurred because the `oauth_states` database table did not exist in the Supabase database. 

The table was defined in the Drizzle schema (`shared/schema.ts`) and the storage layer (`server/storage.ts`), but the migration was never run against the production Supabase database. When users clicked "Connect to Xero", the backend tried to insert a state record into a non-existent table, causing a PostgreSQL error:

```
PostgresError: relation "oauth_states" does not exist
```

## How It Was Verified

1. **Reproduced the error** - Clicked "Connect to Xero" and observed the error in the UI
2. **Checked backend logs** - Found the stack trace showing `relation "oauth_states" does not exist`
3. **Identified the gap** - The table was in code but not in the database

## The Fix

Added the `oauth_states` table creation to the startup migrations in `server/storage.ts`. This ensures the table is automatically created when the server starts, using PostgreSQL's `CREATE TABLE IF NOT EXISTS` for idempotency.

```sql
CREATE TABLE IF NOT EXISTS public.oauth_states (
  id SERIAL PRIMARY KEY,
  state_token VARCHAR(64) NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  org_id TEXT,
  integration VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS oauth_states_state_token_idx ON public.oauth_states(state_token);
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON public.oauth_states(expires_at);
```

## The Final Flow

1. **User clicks "Connect to Xero"** in the Integrations section
2. **Frontend calls** `GET /api/integrations/xero/authorize`
3. **Backend creates OAuth state** in `oauth_states` table with:
   - Cryptographically random state token (32 bytes hex)
   - User ID and email (for secure binding)
   - 10-minute expiry
4. **Backend returns** `{ authorizationUrl: "https://login.xero.com/..." }`
5. **Frontend navigates** to Xero OAuth consent screen (same tab via `window.location.href`)
6. **User authenticates** with Xero
7. **Xero redirects** to `/api/integrations/xero/callback?code=...&state=...`
8. **Backend validates state** by atomically consuming the state record from database
9. **Backend exchanges code** for access/refresh tokens
10. **Tokens are stored** bound to the user who initiated the flow
11. **User is redirected** to `/auth/crm/settings?xero=connected`
12. **Frontend shows success** and invalidates the xero-status query

## Security Properties

- **Server-side state storage** - State is stored in database, not client-side
- **Atomic consumption** - Prevents replay attacks (state can only be used once)
- **Short expiry** - 10-minute window limits attack surface
- **User binding** - Tokens are bound to the user who initiated OAuth, not current session
- **Integration scoping** - State records include `integration` field to prevent cross-integration reuse

## Verification

After the fix, the startup logs show:
```
✅ Startup migrations completed - org system and oauth_states tables ensured
```

Clicking "Connect to Xero" now successfully redirects to the Xero consent screen.
