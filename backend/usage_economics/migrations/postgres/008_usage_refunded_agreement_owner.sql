-- Soft-refunded ownership keeps workspace access while excluding the row from monthly allowance meters.

ALTER TABLE agreement_owner ADD COLUMN IF NOT EXISTS usage_refunded INTEGER NOT NULL DEFAULT 0;
