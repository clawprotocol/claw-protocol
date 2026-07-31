-- Idempotency for Genesis/Pro draft metering (retries must not double-charge).

ALTER TABLE agreement_owner ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_owner_subject_idempotency
  ON agreement_owner (subject_ref, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;
