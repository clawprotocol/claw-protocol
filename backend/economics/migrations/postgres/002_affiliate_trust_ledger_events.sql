-- Append-only affiliate trust ledger (commission lifecycle + attribution signals).
-- No UPDATE/DELETE paths in application code for this table.

CREATE TABLE IF NOT EXISTS affiliate_ledger_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  affiliate_id TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  customer_ref_hash TEXT,
  agreement_id TEXT,
  gross_revenue_usd NUMERIC(24, 6),
  commission_amount_usd NUMERIC(24, 6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  payout_batch_id TEXT,
  proof_id TEXT,
  idempotency_key TEXT UNIQUE,
  meta_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_ale_aff_time ON affiliate_ledger_events (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ale_aff_type ON affiliate_ledger_events (affiliate_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ale_code ON affiliate_ledger_events (referral_code);
