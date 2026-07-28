-- Genesis Dog commercial entitlement (admin-granted). Affiliate status is not the permanent authority.

CREATE TABLE IF NOT EXISTS genesis_dog_entitlements (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  allowance_override INTEGER,
  grant_source TEXT NOT NULL DEFAULT 'admin',
  granted_by TEXT,
  granted_at TIMESTAMPTZ NOT NULL,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_genesis_dog_entitlements_status
  ON genesis_dog_entitlements (status);

CREATE TABLE IF NOT EXISTS genesis_access_requests (
  user_id TEXT PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  updated_at TIMESTAMPTZ NOT NULL
);
