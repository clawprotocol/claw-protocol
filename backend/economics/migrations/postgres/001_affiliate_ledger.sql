-- Affiliate earnings + USDC payout batch ledger (schema from search_path, default lawdog_affiliate_ledger).
-- Exact money: NUMERIC for USD fields; TIMESTAMPTZ for times; INTEGER for bps / risk_hold.

CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  referred_org_id TEXT NOT NULL,
  referred_user_id TEXT,
  internal_subscription_id TEXT,
  stripe_subscription_id TEXT,
  invoice_id TEXT,
  charge_id TEXT,
  payment_intent_id TEXT,
  internal_payment_id TEXT,
  amount_usd NUMERIC(24, 6) NOT NULL,
  rate_bps INTEGER NOT NULL,
  earning_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  unlock_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  fraud_score_snapshot NUMERIC(24, 6),
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  payout_batch_id TEXT,
  risk_hold INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ae_affiliate_status ON affiliate_earnings (affiliate_id, status);
CREATE INDEX IF NOT EXISTS idx_ae_charge ON affiliate_earnings (charge_id);
CREATE INDEX IF NOT EXISTS idx_ae_invoice ON affiliate_earnings (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ae_unlock ON affiliate_earnings (status, unlock_at);

CREATE TABLE IF NOT EXISTS affiliate_payout_methods (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  method_type TEXT NOT NULL,
  usdc_wallet_address TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  wallet_updated_at TIMESTAMPTZ,
  UNIQUE(affiliate_id, method_type)
);

CREATE INDEX IF NOT EXISTS idx_apm_aff ON affiliate_payout_methods (affiliate_id);

CREATE TABLE IF NOT EXISTS affiliate_payout_batches (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  total_usd NUMERIC(24, 6) NOT NULL,
  total_usdc TEXT,
  notes TEXT,
  exported_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payout_record_id TEXT,
  safe_tx_hash TEXT,
  paid_network TEXT,
  last_stale_export_alert_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_apb_aff_status ON affiliate_payout_batches (affiliate_id, status);

CREATE TABLE IF NOT EXISTS affiliate_payout_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  earning_id TEXT,
  accrual_id TEXT,
  affiliate_id TEXT NOT NULL,
  amount_usd NUMERIC(24, 6) NOT NULL,
  wallet_address TEXT,
  amount_usdc TEXT,
  payout_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apbi_batch ON affiliate_payout_batch_items (batch_id);

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  amount_usd NUMERIC(24, 6) NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ap_aff_status ON affiliate_payouts (affiliate_id, status);
