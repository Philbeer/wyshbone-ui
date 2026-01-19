# Xero OAuth Session Binding

This document explains how the Xero OAuth integration ensures secure session binding, preventing cross-user token binding attacks.

## Overview

When a user connects to Xero, the OAuth flow must ensure that:
1. The user who initiates the connection is the same user who receives the tokens
2. OAuth callback cannot be hijacked to connect tokens to a different user
3. Session state is maintained throughout the OAuth flow

## Architecture

### Server-Side OAuth State Storage

We use a database-backed OAuth state table (`oauth_states`) to securely bind OAuth flows to users:

```sql
CREATE TABLE oauth_states (
  id SERIAL PRIMARY KEY,
  state_token VARCHAR(64) NOT NULL UNIQUE,  -- Cryptographically random token
  user_id TEXT NOT NULL,                      -- User who initiated OAuth
  user_email TEXT NOT NULL,                   -- User's email for logging
  org_id TEXT,                                -- Optional org_id for multi-tenant
  integration VARCHAR(50) NOT NULL,           -- e.g., 'xero'
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,              -- Short expiry (10 minutes)
  used_at TIMESTAMP                           -- Consumed when callback processed
);
```

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Xero OAuth Session Binding Flow                  │
└─────────────────────────────────────────────────────────────────────┘

1. User clicks "Connect to Xero"
   │
   ├──► Frontend calls GET /api/integrations/xero/authorize
   │    │
   │    └──► Server validates user session (x-session-id header)
   │         │
   │         └──► Server creates oauth_states record:
   │              • state_token = random 32 bytes hex
   │              • user_id = authenticated user
   │              • integration = 'xero'
   │              • expires_at = now + 10 minutes
   │
   ├──► Server returns { authorizationUrl: "https://login.xero.com/..." }
   │
   └──► Frontend navigates to Xero OAuth (same tab)

2. User authenticates with Xero
   │
   └──► Xero redirects to /api/integrations/xero/callback?code=...&state=...

3. Server processes callback
   │
   ├──► Server calls storage.consumeOAuthState(stateToken)
   │    │
   │    └──► Atomically:
   │         • Validates state exists
   │         • Validates not expired
   │         • Validates not already used
   │         • Marks as used (sets used_at)
   │         • Returns user_id/user_email from state
   │
   ├──► If state invalid → Redirect to error page
   │
   ├──► Exchange code for tokens with Xero
   │
   └──► Store tokens bound to user_id FROM STATE (not from session!)
        │
        └──► Redirect to /auth/crm/settings?xero=connected

4. Frontend detects ?xero=connected
   │
   ├──► Invalidates xero-status query
   │
   └──► Shows success dialog, UI updates to "Connected"
```

## Security Properties

### 1. Server-Side State Binding
The OAuth state is stored in the database, not in client-side storage or cookies. This prevents:
- State tampering by malicious actors
- Cross-session state injection

### 2. Atomic State Consumption
The `consumeOAuthState` function atomically:
- Validates the state token exists and is valid
- Marks it as used to prevent replay attacks
- Returns the user identity from when OAuth was initiated

```typescript
async consumeOAuthState(stateToken: string): Promise<SelectOAuthState | null> {
  const [state] = await db
    .update(oauthStates)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(oauthStates.stateToken, stateToken),
        isNull(oauthStates.usedAt),           // Not already used
        gt(oauthStates.expiresAt, new Date()) // Not expired
      )
    )
    .returning();
  return state || null;
}
```

### 3. Short Expiry
OAuth states expire after 10 minutes, limiting the attack window.

### 4. Same-Tab Navigation
The frontend uses `window.location.href` instead of opening a new tab, ensuring:
- Session cookies are maintained
- User stays in the same browser context
- No "mystery new tab" issues

## Error Handling

The callback handles these error cases:

| Error Code | Description |
|------------|-------------|
| `missing_code_or_state` | OAuth interrupted, code or state missing |
| `invalid_or_expired_state` | State not found, expired, or already used |
| `token_exchange_failed` | Failed to exchange code for tokens |
| `connections_fetch_failed` | Connected but couldn't fetch org details |

## Cleanup

Expired OAuth states are automatically cleaned up every 15 minutes:

```typescript
setInterval(async () => {
  const deleted = await storage.deleteExpiredOAuthStates();
  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} expired OAuth state(s)`);
  }
}, 15 * 60 * 1000);
```

## Testing

To verify the session binding works correctly:

1. **Same User Test**: Log in as User A, connect Xero, verify tokens are stored for User A
2. **Cross-User Test**: Verify User B cannot see User A's Xero connection
3. **Expired State Test**: Wait 10+ minutes after starting OAuth, verify callback fails
4. **Replay Test**: Try to use the same callback URL twice, verify second attempt fails
5. **Invalid State Test**: Manually craft a callback with invalid state, verify it's rejected
