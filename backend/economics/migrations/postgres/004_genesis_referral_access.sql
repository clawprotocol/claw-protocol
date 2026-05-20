-- Genesis Referral Access (Genesis Dogs partner program).
-- Applied with affiliate ledger schema when Postgres ledger is enabled.
-- Mirrors SQLite economics tables for hosted Postgres / Supabase deployments.

CREATE TABLE IF NOT EXISTS genesis_affiliates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  community_slug TEXT,
  affiliate_status TEXT NOT NULL DEFAULT 'active',
  payout_rate NUMERIC(8, 6) NOT NULL DEFAULT 0.30,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_genesis_affiliates_user ON genesis_affiliates (user_id);
CREATE INDEX IF NOT EXISTS idx_genesis_affiliates_status ON genesis_affiliates (affiliate_status);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  referred_user_id TEXT,
  referred_org_id TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL,
  converted_at TIMESTAMPTZ,
  source_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ref_attr_code ON referral_attributions (referral_code);
CREATE INDEX IF NOT EXISTS idx_ref_attr_visitor ON referral_attributions (visitor_id);
CREATE INDEX IF NOT EXISTS idx_ref_attr_referred_user ON referral_attributions (referred_user_id)
  WHERE referred_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_attr_visitor_code
  ON referral_attributions (visitor_id, referral_code);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT,
  referred_org_id TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT NOT NULL,
  gross_amount NUMERIC(24, 6) NOT NULL,
  commission_rate NUMERIC(8, 6) NOT NULL,
  commission_amount NUMERIC(24, 6) NOT NULL,
  status TEXT NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT UNIQUE,
  void_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_aff_comm_referrer_status ON affiliate_commissions (referrer_user_id, status);
CREATE INDEX IF NOT EXISTS idx_aff_comm_invoice ON affiliate_commissions (stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_aff_comm_org ON affiliate_commissions (referred_org_id);

CREATE TABLE IF NOT EXISTS genesis_payout_batches (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  total_commission_usd NUMERIC(24, 6) NOT NULL,
  notes TEXT,
  exported_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS genesis_payout_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  commission_id TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  amount_usd NUMERIC(24, 6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_genesis_payout_items_batch ON genesis_payout_batch_items (batch_id);
