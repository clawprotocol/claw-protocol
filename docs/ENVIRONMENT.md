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
| `CLAW_ALLOW_OPERATOR_BOOTSTRAP` | Staging-only one-shot first `support_operator` via `POST /v1/admin/operators/bootstrap`; must stay unset/`0` in production — see `docs/ops/STAGING_OPERATOR_BOOTSTRAP.md` |

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

LawDog Phase A uses the Supabase REST client when configured:

| Variable | Where | Purpose |
|----------|--------|---------|
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (secret) | Service role for dashboard writes/reads |
| `VITE_SUPABASE_URL` | Frontend build | Public project URL (optional Phase A) |
| `VITE_SUPABASE_ANON_KEY` | Frontend build | Anon key (optional Phase A) |

Aliases: `CLAW_SUPABASE_URL`, `CLAW_SUPABASE_SERVICE_ROLE_KEY`.

Apply dashboard schema: `backend/lawdog_dashboard/migrations/postgres/001_phase_a_dashboard.sql` in the Supabase SQL editor (or via `CLAW_DATABASE_URL` psql when using the same Postgres).

When Supabase env vars are **unset**, dashboard uses the existing local/file workspace-index fallback.

You can also use **Supabase Postgres** for draft JSON by setting `CLAW_DATABASE_URL` to the Supabase connection string (pooler URL recommended for serverless).

## Review invitation email (Resend)

Server-side review invites send only when `CLAW_REVIEW_DELIVERY_MODE` is `email` or `manual_and_email` **and** all three vars below are set. Default mode is `manual` (copy/share links only; zero outbound email).

| Variable | Where | Purpose |
|----------|--------|---------|
| `RESEND_API_KEY` | Backend (secret) | Resend API bearer token |
| `EMAIL_FROM` | Backend | Verified sender address in Resend (e.g. `LawDog <noreply@yourdomain.com>`) |
| `CLAW_APP_PUBLIC_ORIGIN` | Backend | SPA origin for absolute review links (scheme + host, no trailing slash) |
| `CLAW_REVIEW_DELIVERY_MODE` | Backend | `manual` (default), `email`, or `manual_and_email` |

`GET /admin/runtime-summary` exposes `email_configured: true/false` (never the API key). Sends are non-fatal: `POST …/review-sent` succeeds even when Resend fails or email is not configured.

## What must never be in frontend

- `CLAW_ADMIN_SECRET`
- `STRIPE_WEBHOOK_SECRET` / Stripe secret keys
- `OPENAI_API_KEY`
- `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET`
- Database URLs
