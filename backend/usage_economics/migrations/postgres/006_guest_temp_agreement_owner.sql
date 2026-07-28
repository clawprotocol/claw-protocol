-- Guest temporary drafts are not persisted commercial agreements for allowance metering.

ALTER TABLE agreement_owner ADD COLUMN IF NOT EXISTS guest_temp INTEGER NOT NULL DEFAULT 0;
