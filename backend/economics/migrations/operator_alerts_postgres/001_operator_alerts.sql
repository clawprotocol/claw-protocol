-- Operator alert feed (anchoring, affiliate payouts, treasury shortfall, etc.)

CREATE TABLE IF NOT EXISTS lawdog_operator_alerts (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  batch_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_loa_created ON lawdog_operator_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loa_type ON lawdog_operator_alerts (event_type);
