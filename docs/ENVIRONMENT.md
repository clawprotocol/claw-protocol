# LawDog Environment Variables

## Conventions

| Prefix | Where | Committed to git? |
|--------|--------|-------------------|
| `VITE_*` | Frontend build (browser bundle) | **Never secrets** — public by design |
| `CLAW_*` | Backend runtime only | Secrets via host dashboard |
| `STRIPE_*` | Backend (webhooks) | Secret |
| `OPENAI_*` | Backend LLM | Secret |
| `DATABASE_URL` / `CLAW_DATABASE_URL` | Postgres DSN | Secret |

Frontend access: `frontend/src/lib/clawApi.ts` (API base) and `frontend/src/config/publicEnv.ts` (other public vars).

Backend validation warnings at startup: `backend/config/env_bootstrap.py` (logs only, no crash).

## Required for production API

| Variable | Purpose |
|----------|---------|
| `CLAW_ENVIRONMENT` | `production` (disables dev-only bypasses) |
| `CLAW_CORS_ALLOW_ORIGINS` | Comma-separated SPA origins (split deploy) |
| `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` | Recipient review/signer tokens |
| `OPENAI_API_KEY` | Premium full draft / LLM routes |
| `STRIPE_WEBHOOK_SECRET` | `POST /webhook/stripe` signature verify |
| `CLAW_ADMIN_SECRET` | `x-claw-admin-secret` for admin/ops routes |

Strongly recommended:

| Variable | Purpose |
|----------|---------|
| `CLAW_DATABASE_URL` | Postgres (Supabase, Railway PG, etc.) |
| `CLAW_DATA_DIR` | Writable volume for local artifacts/SQLite fallback |

## Required for production frontend (build-time)

| Variable | Purpose |
|----------|---------|
| `VITE_LAWDOG_PRIVACY_EMAIL` | Privacy Policy contact (monitored inbox) |
| `VITE_CLAW_API_BASE` | API origin when SPA and API are on different hosts |

Optional frontend:

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE` | Legacy alias for `VITE_CLAW_API_BASE` |
| `VITE_CLAW_SUPPRESS_API_BASE_LOG` | Quiet dev/CI console |
| `VITE_CLAW_FEATURE_*` | Feature flags — see `frontend/src/config/featureFlags.ts` |

Runtime injection (no rebuild): `window.__CLAW_PUBLIC_API_BASE__` or `<meta name="claw-api-base" content="...">`.

## Stripe (server-only)

| Variable | Purpose |
|----------|---------|
| `STRIPE_WEBHOOK_SECRET` | Webhook HMAC (required in production) |
| `CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED` | `1` = skip signature in local/dev/test only |

Checkout Session metadata (set by app when Stripe Checkout is wired): `org_id`, `referral_code`, `visitor_id`, `plan_code=pro` — see Genesis Referral helpers.

## Genesis Referral / admin ops

| Variable | Purpose |
|----------|---------|
| `CLAW_ADMIN_SECRET` | Header `x-claw-admin-secret` for `/v1/genesis-referral/ops/*` and admin console |

## Local / dev defaults

| Variable | Default behavior |
|----------|------------------|
| `CLAW_ENVIRONMENT` | `local` — permissive CORS (`*`), rate limit off |
| API base (frontend) | `http://127.0.0.1:8000` when unset in dev |
| `CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED` | Optional unsigned Stripe webhooks for local testing |

Copy templates:

- Repo root: `.env.example`
- Frontend: `frontend/.env.example`

## Supabase

LawDog does not use the Supabase JS client. Use **Supabase Postgres** by setting `CLAW_DATABASE_URL` to the Supabase connection string (pooler URL recommended for serverless).

## What must never be in frontend

- `CLAW_ADMIN_SECRET`
- `STRIPE_WEBHOOK_SECRET` / Stripe secret keys
- `OPENAI_API_KEY`
- `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET`
- Database URLs
