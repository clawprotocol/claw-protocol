-- Anchoring schema for Postgres (lawdog_anchoring). IDs are TEXT (application-generated).
-- Timestamps stored as TIMESTAMPTZ; app still emits ISO-8601 Z strings compatible with casts.

CREATE TABLE IF NOT EXISTS anchoring_schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO anchoring_schema_meta (key, value) VALUES ('version', '1')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS receipt_batches (
  id TEXT PRIMARY KEY,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  receipt_count INTEGER NOT NULL DEFAULT 0,
  merkle_root_sha256 TEXT,
  status TEXT NOT NULL,
  adaptive_window_minutes INTEGER NOT NULL,
  min_receipts_at_close INTEGER,
  hourly_rate_at_close DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipt_batches_status_opened
  ON receipt_batches (status, opened_at);

CREATE TABLE IF NOT EXISTS batch_receipts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  leaf_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_batch_receipts_receipt_id UNIQUE (receipt_id),
  CONSTRAINT fk_batch_receipts_batch FOREIGN KEY (batch_id) REFERENCES receipt_batches (id)
);

CREATE INDEX IF NOT EXISTS idx_batch_receipts_batch_leaf
  ON batch_receipts (batch_id, leaf_index);

CREATE TABLE IF NOT EXISTS anchor_jobs (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  anchor_type TEXT NOT NULL,
  target_root_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  txid TEXT,
  fee_usd DOUBLE PRECISION,
  block_height INTEGER,
  confirmations INTEGER NOT NULL DEFAULT 0,
  queued_at TIMESTAMPTZ NOT NULL,
  broadcast_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  network TEXT,
  failure_kind TEXT,
  provider_type TEXT,
  provider_job_id TEXT,
  provider_response_summary TEXT,
  failure_history_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_anchor_jobs_status_queued
  ON anchor_jobs (status, queued_at);

CREATE TABLE IF NOT EXISTS periodic_anchor_sets (
  id TEXT PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  super_root_sha256 TEXT,
  included_batch_count INTEGER NOT NULL DEFAULT 0,
  btc_cadence_days INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS anchor_wallet_status (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  balance_native DOUBLE PRECISION,
  balance_usd_estimate DOUBLE PRECISION,
  low_threshold_usd DOUBLE PRECISION NOT NULL,
  target_refill_usd DOUBLE PRECISION NOT NULL,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_anchor_wallet_chain_address UNIQUE (chain, wallet_address)
);

CREATE TABLE IF NOT EXISTS anchor_alert_events (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  chain TEXT,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  sent_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
