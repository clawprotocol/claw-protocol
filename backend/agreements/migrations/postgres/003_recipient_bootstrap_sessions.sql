-- Phase 3C2A: durable recipient bootstrap sessions (opaque cookie auth).

CREATE TABLE IF NOT EXISTS recipient_bootstrap_sessions (
  session_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  agreement_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recipient_bootstrap_sessions_agreement
  ON recipient_bootstrap_sessions (agreement_id);

CREATE INDEX IF NOT EXISTS idx_recipient_bootstrap_sessions_token_hash
  ON recipient_bootstrap_sessions (token_hash);
