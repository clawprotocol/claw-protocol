-- Timeline, events, receipts, Merkle batches, timeline anchor jobs (proof spine).

CREATE TABLE IF NOT EXISTS timelines (
  timeline_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parties_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  protocol_version TEXT NOT NULL,
  network TEXT NOT NULL,
  frozen SMALLINT NOT NULL DEFAULT 0,
  frozen_manifest_sha256 TEXT,
  frozen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  notice_json TEXT,
  marker_json TEXT,
  event_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (timeline_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_events_timeline ON events (timeline_id);
CREATE INDEX IF NOT EXISTS idx_events_event_id_lookup ON events (event_id);

CREATE TABLE IF NOT EXISTS receipts (
  receipt_id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  network TEXT NOT NULL,
  epoch_id TEXT,
  btc_txid TEXT NOT NULL,
  commitment TEXT NOT NULL,
  merkle_proof_json TEXT NOT NULL,
  zk_proof_refs_json TEXT,
  issued_at TIMESTAMPTZ NOT NULL,
  receipt_hash_sha256 TEXT,
  batch_id TEXT,
  batch_merkle_root_sha256 TEXT,
  leaf_index INTEGER
);

CREATE INDEX IF NOT EXISTS idx_receipts_timeline_issued ON receipts (timeline_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_unbatched ON receipts (network, protocol_version)
  WHERE receipt_hash_sha256 IS NOT NULL AND (batch_id IS NULL OR batch_id = '');

CREATE TABLE IF NOT EXISTS batches (
  batch_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  network TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  leaf_count INTEGER NOT NULL,
  merkle_root TEXT NOT NULL,
  batch_commitment TEXT NOT NULL,
  anchor_txid TEXT,
  anchor_op_return TEXT,
  anchor_status TEXT,
  anchor_error TEXT,
  anchor_attempts INTEGER NOT NULL DEFAULT 0,
  anchor_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches (created_at ASC);

CREATE TABLE IF NOT EXISTS batch_receipts (
  batch_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  leaf_index INTEGER NOT NULL,
  PRIMARY KEY (batch_id, receipt_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_receipts_batch ON batch_receipts (batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_receipts_receipt ON batch_receipts (receipt_id);

CREATE TABLE IF NOT EXISTS timeline_anchor_jobs (
  job_id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  timeline_id TEXT NOT NULL,
  network TEXT NOT NULL,
  commitment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  txid TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_timeline_anchor_jobs_status_created
  ON timeline_anchor_jobs (status, created_at);
