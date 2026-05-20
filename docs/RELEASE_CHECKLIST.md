# LawDog Release Checklist (Post-Deploy)

Use after Railway (or any host) finishes deploying **main**. No product behavior changes — verification only.

## Pre-flight (before deploy)

- [ ] `git status` clean; `main` matches `origin/main`
- [ ] **Backend Genesis bundle on main** — must include:
  - `backend/routers/genesis_referral_api.py`
  - `backend/economics/genesis_referral_store.py`
  - `backend/affiliates/genesis_*`
  - `backend/main.py` (`genesis_referral_router`)
  - `backend/economics/migrations/postgres/004_genesis_referral_access.sql`
- [ ] Frontend build includes `VITE_LAWDOG_PRIVACY_EMAIL` and `VITE_CLAW_API_BASE` (split deploy only)
- [ ] API env set — see `docs/ENVIRONMENT.md`

### Schema / migrations (Genesis)

| Store | When | What happens |
|-------|------|----------------|
| **Economics SQLite** | Every API `init_schema()` | `ensure_genesis_referral_schema()` creates `genesis_affiliates`, `referral_attributions`, `affiliate_commissions`, etc. |
| **Postgres `lawdog_affiliate_ledger`** | `use_postgresql_for_affiliate_ledger()` + startup | Sorted SQL migrations `001` → `004` via `ensure_affiliate_ledger_schema()` |

**Launch note:** Genesis commission writes use **Economics SQLite** (`CLAW_DATA_DIR/economics.sqlite3`). Mount a **persistent volume** on PaaS or commissions/attributions are lost on redeploy. Postgres `004_*` tables are for ledger-schema parity / future wiring — verify SQLite path for GTM.

---

## Automated smoke (recommended)

```bash
export CLAW_API_BASE=https://<api-host>
export CLAW_FRONTEND_URL=https://<app-host>          # optional
export CLAW_ADMIN_SECRET=<same as API>               # optional
python3 scripts/release_smoke.py
```

Full platform smoke (optional):

```bash
python3 scripts/deploy_smoke.py --api-base "$CLAW_API_BASE" --admin-secret "$CLAW_ADMIN_SECRET"
```

---

## Manual verification (deterministic order)

### 1. API liveness

```bash
curl -sS "$CLAW_API_BASE/health" | jq .
```

Expect `"ok": true`.

### 2. Readiness (if Postgres configured)

```bash
curl -sS "$CLAW_API_BASE/v1/readyz" | jq .
```

Expect `"ok": true` (503 = fix `CLAW_DATABASE_URL` / connectivity).

### 3. Anonymous create (no referral)

Open `https://<app>/app/create` — intake visible, no auth gate, starter flow works.

### 4. Referral capture (`?ref=`)

Open `https://<app>/app/create?ref=GENESISDOG` (or enrolled code).

```bash
curl -sS -X POST "$CLAW_API_BASE/v1/genesis-referral/capture" \
  -H 'Content-Type: application/json' \
  -d '{"referral_code":"GENESISDOG","visitor_id":"vis_manual_qa_001","source_path":"/app/create"}'
```

- Unknown code → `200` + `"ok": false` (soft-fail)
- Valid enrolled code → `200` + `"ok": true`

### 5. Checkout metadata (Pro)

```bash
curl -sS -X POST "$CLAW_API_BASE/v1/genesis-referral/checkout-metadata" \
  -H 'Content-Type: application/json' \
  -d '{"org_id":"qa-org","referral_code":"GENESISDOG","visitor_id":"vis_qa","plan_code":"pro"}' | jq .metadata
```

Expect: `org_id`, `claw_org_id`, `visitor_id`, `referral_code`, `plan_code` = `"pro"`.

### 6. Stripe `invoice.paid` (staging / dev unsigned only)

On production, use Stripe Dashboard test webhook or real invoice — do not enable unsigned bypass.

With dev API (`CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED=1`, relaxed env):

- Send test `invoice.paid` with metadata `org_id`, `referral_code`, `plan_code=pro`
- Confirm one row in `affiliate_commissions` (30% of gross) via ops CSV or DB

### 7. Genesis affiliate dashboard

`https://<app>/app/genesis-referral` — enrolled partner sees link + commission summary (404 API = user not enrolled).

### 8. Genesis ops

`https://<app>/app/ops/genesis-referral` — requires admin secret in session (from `/app/admin`).

```bash
curl -sS -o /dev/null -w "%{http_code}\n" "$CLAW_API_BASE/v1/genesis-referral/ops/summary"
# Expect 403 without header

curl -sS "$CLAW_API_BASE/v1/genesis-referral/ops/commissions/export.csv" \
  -H "x-claw-admin-secret: $CLAW_ADMIN_SECRET" | head -3
# Expect CSV header with referrer_user_id, stripe_invoice_id, commission_amount, ...
```

### 9. Legacy affiliate routes

Confirm `POST /v1/affiliates/attribute` still works (unchanged legacy path).

---

## Required production env (quick reference)

| Variable | Required |
|----------|----------|
| `CLAW_ENVIRONMENT` | `production` |
| `CLAW_CORS_ALLOW_ORIGINS` | Split-origin SPA |
| `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` | Yes |
| `OPENAI_API_KEY` | Yes (Pro draft) |
| `STRIPE_WEBHOOK_SECRET` | Yes |
| `CLAW_ADMIN_SECRET` | Yes |
| `CLAW_DATABASE_URL` | Strongly recommended |
| `VITE_LAWDOG_PRIVACY_EMAIL` | Frontend build |
| `VITE_CLAW_API_BASE` | Split-origin frontend only |

Details: `docs/ENVIRONMENT.md`.

---

## Rollback

- Redeploy previous Railway deployment / image tag
- Genesis tables are additive — rollback does not require migration down
- If bad commission rows: mark `void` via DB or admin process (manual at launch)
