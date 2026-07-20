-- GTM Security Slice 3B: durable negotiation-review sessions (opaque cookie auth).

CREATE TABLE IF NOT EXISTS negotiation_review_sessions (
  session_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  agreement_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_negotiation_review_sessions_agreement
  ON negotiation_review_sessions (agreement_id);

CREATE INDEX IF NOT EXISTS idx_negotiation_review_sessions_token_hash
  ON negotiation_review_sessions (token_hash);
