-- Crypto onramp payments: idempotent payments, receipts, reserves, canonical events, webhook claims.

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL UNIQUE,
  amount_usd DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  org_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments (provider, provider_payment_id);

CREATE TABLE IF NOT EXISTS crypto_receipts (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  amount_usd DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crypto_payment ON crypto_receipts (payment_id);

CREATE TABLE IF NOT EXISTS claw_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  keys_allocated INTEGER NOT NULL,
  payment_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_onramp_clawkeys_org ON claw_keys (org_id);
CREATE INDEX IF NOT EXISTS idx_onramp_clawkeys_pay ON claw_keys (payment_id);

CREATE TABLE IF NOT EXISTS reserves (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  amount_usd DOUBLE PRECISION NOT NULL,
  allocated_at TIMESTAMPTZ NOT NULL,
  release_at TIMESTAMPTZ NOT NULL,
  released INTEGER NOT NULL DEFAULT 0,
  payment_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reserves_release ON reserves (released, release_at);

CREATE TABLE IF NOT EXISTS payment_canonical_events (
  id TEXT PRIMARY KEY,
  event_sha256 TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  reserve_id TEXT,
  canonical_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pce_payment ON payment_canonical_events (payment_id);

CREATE TABLE IF NOT EXISTS webhook_idempotency (
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (provider, idempotency_key)
);
