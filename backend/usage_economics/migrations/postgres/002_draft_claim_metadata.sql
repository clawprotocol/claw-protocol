-- Anonymous draft claim metadata (ownership transfer audit trail).

ALTER TABLE agreement_owner ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE agreement_owner ADD COLUMN IF NOT EXISTS claim_method TEXT;
ALTER TABLE agreement_owner ADD COLUMN IF NOT EXISTS anonymous_source_org TEXT;
