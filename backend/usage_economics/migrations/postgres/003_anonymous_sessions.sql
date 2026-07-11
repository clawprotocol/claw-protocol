-- Server-issued anonymous workspace sessions and auth continuation transactions.

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  session_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_user_id TEXT,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_token_hash ON anonymous_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_org_id ON anonymous_sessions (org_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_expires ON anonymous_sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_continuation_transactions (
  continuation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  agreement_id TEXT,
  destination_path TEXT NOT NULL,
  workflow_stage TEXT,
  auth_purpose TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  claimed_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_continuation_session ON auth_continuation_transactions (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_continuation_expires ON auth_continuation_transactions (expires_at);
