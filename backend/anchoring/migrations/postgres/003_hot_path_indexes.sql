-- Launch hot paths: proof enrichment (by Merkle root), worker queue/confirm scans, operator counts/summary.

-- Anchor jobs: lookups by batch Merkle root (proof UI, promotion, dual-chain status).
CREATE INDEX IF NOT EXISTS idx_anchor_jobs_target_chain_type_created
  ON anchor_jobs (target_root_sha256, chain, anchor_type, created_at);

-- Worker: claim queued receipt-batch jobs (matches ORDER BY target_root_sha256, chain, created_at).
CREATE INDEX IF NOT EXISTS idx_anchor_jobs_batch_queued_pick
  ON anchor_jobs (target_root_sha256, chain, created_at)
  WHERE anchor_type = 'batch' AND status = 'queued';

-- Worker: confirmation polling (ORDER BY updated_at).
CREATE INDEX IF NOT EXISTS idx_anchor_jobs_batch_pending_confirm
  ON anchor_jobs (updated_at)
  WHERE anchor_type = 'batch'
    AND status IN ('submitted_unconfirmed', 'broadcast', 'building');

-- Operator: stale unconfirmed count (broadcast_at < cutoff).
CREATE INDEX IF NOT EXISTS idx_anchor_jobs_batch_unconf_broadcast
  ON anchor_jobs (broadcast_at)
  WHERE anchor_type = 'batch'
    AND status IN ('submitted_unconfirmed', 'broadcast', 'building')
    AND broadcast_at IS NOT NULL;

-- Operator: queued / per-status counts for batch jobs.
CREATE INDEX IF NOT EXISTS idx_anchor_jobs_batch_status
  ON anchor_jobs (anchor_type, status);

-- Receipt batches: promote to fully_anchored by Merkle root (hot after confirm).
CREATE INDEX IF NOT EXISTS idx_receipt_batches_root_ready
  ON receipt_batches (merkle_root_sha256)
  WHERE status = 'ready_to_anchor';

-- Operator: overdue ready_to_anchor (closed_at < cutoff).
CREATE INDEX IF NOT EXISTS idx_receipt_batches_ready_closed_at
  ON receipt_batches (closed_at)
  WHERE status = 'ready_to_anchor' AND closed_at IS NOT NULL;

-- Operator: latest fully anchored batch (ORDER BY updated_at DESC LIMIT 1).
CREATE INDEX IF NOT EXISTS idx_receipt_batches_fully_anchored_updated
  ON receipt_batches (updated_at DESC)
  WHERE status = 'fully_anchored';
