-- Add immutable accepted-corpus authority without assigning authority to legacy rows.

ALTER TABLE agreement_versions
  ADD COLUMN IF NOT EXISTS version_id TEXT;

ALTER TABLE agreement_versions
  ADD COLUMN IF NOT EXISTS authority_state TEXT;

ALTER TABLE agreement_versions
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE agreement_versions
  ADD COLUMN IF NOT EXISTS parties_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agreement_versions_version_id
  ON agreement_versions (version_id)
  WHERE version_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agreement_versions_accepted_authority
  ON agreement_versions (agreement_id)
  WHERE authority_state = 'accepted';
