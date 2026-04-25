-- Monotonic counters for anchoring ops (batch-close sequence for mirror cadence, etc.).

CREATE TABLE IF NOT EXISTS anchoring_ops_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
