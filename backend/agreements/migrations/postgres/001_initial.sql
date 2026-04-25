-- Agreement transactional domain (schema from search_path, default lawdog_agreements).
-- Draft JSON is canonical application payload; versions mirror legacy SQLite (no cross-table FK,
-- matching file+sqlite semantics where version rows are not database-enforced against drafts).

CREATE TABLE IF NOT EXISTS agreement_drafts (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agreement_drafts_updated_at
  ON agreement_drafts (updated_at DESC);

CREATE TABLE IF NOT EXISTS agreement_versions (
  agreement_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  disclaimers_json TEXT,
  metadata_json TEXT,
  PRIMARY KEY (agreement_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agreement_versions_by_agreement
  ON agreement_versions (agreement_id, version DESC);

CREATE TABLE IF NOT EXISTS agreement_signing_locks (
  agreement_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
