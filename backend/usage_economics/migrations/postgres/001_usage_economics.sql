-- Usage economics: agreement ownership, subject counters, IP heuristics, analytics_events.

CREATE TABLE IF NOT EXISTS agreement_owner (
  agreement_id TEXT PRIMARY KEY,
  subject_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  internal_keys_draft INTEGER NOT NULL DEFAULT 0,
  internal_keys_finalize INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agreement_owner_subject ON agreement_owner (subject_ref);
CREATE INDEX IF NOT EXISTS idx_agreement_owner_subject_created ON agreement_owner (subject_ref, created_at);

CREATE TABLE IF NOT EXISTS subject_counters (
  subject_ref TEXT PRIMARY KEY,
  keys_consumed_total INTEGER NOT NULL DEFAULT 0,
  agreements_created INTEGER NOT NULL DEFAULT 0,
  agreements_finalized INTEGER NOT NULL DEFAULT 0,
  ai_calls_count INTEGER NOT NULL DEFAULT 0,
  abuse_flag INTEGER NOT NULL DEFAULT 0,
  soft_throttle_flag INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ip_subject_day (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  PRIMARY KEY (ip, day, subject_ref)
);

CREATE INDEX IF NOT EXISTS idx_ip_day ON ip_subject_day (ip, day);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  subject_ref TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_subject ON analytics_events (subject_ref, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events (created_at DESC);

CREATE TABLE IF NOT EXISTS ip_draft_burst (
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ip_draft_burst_ip_ts ON ip_draft_burst (ip, created_at);
