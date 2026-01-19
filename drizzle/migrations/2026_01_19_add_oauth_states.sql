-- Migration: Add OAuth states table for secure session binding
-- This table stores server-side OAuth state records to ensure OAuth callbacks
-- are securely bound to the user who initiated the flow

CREATE TABLE IF NOT EXISTS oauth_states (
  id SERIAL PRIMARY KEY,
  state_token VARCHAR(64) NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  org_id TEXT,
  integration VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS oauth_states_token_idx ON oauth_states (state_token);
CREATE INDEX IF NOT EXISTS oauth_states_user_idx ON oauth_states (user_id);
CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at);
