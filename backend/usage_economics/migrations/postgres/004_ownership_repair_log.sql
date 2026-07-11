-- Ownership repair audit trail (no agreement content).

CREATE TABLE IF NOT EXISTS agreement_owner_repair_log (
  agreement_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  subject_ref TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agreement_owner_repair_log_action
  ON agreement_owner_repair_log (action, created_at DESC);
