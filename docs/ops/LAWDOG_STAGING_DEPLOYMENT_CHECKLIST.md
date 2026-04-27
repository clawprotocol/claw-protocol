# LawDog staging deployment checklist

**Deployment candidate branch:** `feat/vs01-recipient-flow` (build and tag from this branch unless you promote another).

**Deeper references:** [ENV_TOPOLOGY](../architecture/ENV_TOPOLOGY.md), [Launch database profile](LAUNCH_DATABASE_PROFILE.md), [Deploy smoke test](DEPLOY_SMOKE_TEST.md), [Operator runbook](OPERATOR_RUNBOOK.md).

---

## Architecture (what you are shipping)

| Layer | Technology | Notes |
|--------|------------|--------|
| **Frontend** | Vite + React static assets (`cd frontend && npm run build` → `frontend/dist/`) | API URL is **build-time** via `VITE_CLAW_API_BASE` or `VITE_API_BASE` (see `frontend/src/lib/clawApi.ts`). Rebuild when API origin changes. |
| **Backend** | FastAPI `uvicorn backend.main:app` | Exposes health, readyz, agreements, webhooks, etc. |
| **Postgres** | Single `CLAW_DATABASE_URL` (or `DATABASE_URL`) for staging | Preferred over scattered SQLite on multi-instance hosts. See [ENV_TOPOLOGY](../architecture/ENV_TOPOLOGY.md). |
| **Worker (optional for first demo)** | `python -m backend.workers.run_anchor_worker` (or cron) | Not required for basic API + UI smoke; required for anchoring drain. |
| **Stripe** | Test mode: `STRIPE_WEBHOOK_SECRET` + Dashboard webhook URL → `POST /webhook/stripe` | `CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED` is **not** honored in `staging` (only `local`/`dev`/`test`). |
| **OpenAI** | `OPENAI_API_KEY` on **API process only** | Never bake into the frontend. |

---

## CORS (staging is strict by default)

Backend `CLAW_CORS_ALLOW_ORIGINS`: comma-separated **origins** (scheme + host, no path), e.g. `https://app-staging.example.com,https://www-staging.example.com`.

- If **unset** and `CLAW_ENVIRONMENT` is **`staging`**, the default origin list is **empty** (browsers block cross-origin XHR from your SPA host). **Set this before declaring staging “works”.**
- Relaxed default `*` applies only when `CLAW_ENVIRONMENT` is `local` / `dev` / `test` (see `backend/main.py` `_cors_origins`).

---

## Environment variables by service

### Backend (API) — minimum staging set

| Variable | Staging | Notes |
|----------|---------|--------|
| `CLAW_ENVIRONMENT` | `staging` | Labels logs, CORS, admin strictness, external-AI policy class. |
| `CLAW_DATABASE_URL` or `DATABASE_URL` | `postgresql://...` | Single DSN; run migrations / schema per your process. |
| `CLAW_CORS_ALLOW_ORIGINS` | `https://<your-frontend-host>` | Required for cross-origin SPA. |
| `OPENAI_API_KEY` | Secret | LLM / premium draft routes. |
| `CLAW_ADMIN_SECRET` | Strong random | **Required** for production-like envs: `x-claw-admin-secret` on admin paths. |
| `STRIPE_WEBHOOK_SECRET` | Stripe test-mode signing secret | For `POST /webhook/stripe`. |
| `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` / recipient tokens | As required by product | See ENV_TOPOLOGY for signing and recipient links. |
| `CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED` | **Unset or `0`** | Unsigned webhooks only allowed in `local`/`dev`/`test`. |

**Optional but common:** `CLAW_DATA_DIR`, `CLAW_BLOB_ROOT` or object storage vars, per-store `CLAW_*_DATABASE_URL` overrides, rate limits, `CLAW_DEBUG=0` for prod-like behavior.

**Staging OpenAI / airlock:** `CLAW_ALLOW_EXTERNAL_AI_LOCAL=1` is allowed when `CLAW_ENVIRONMENT=staging` (see `backend/config/external_ai_policy.py`). Do **not** set in production.

### Frontend — build-time (`VITE_*`)

Set in the **build** environment (not only at runtime for static hosting).

| Variable | Staging | Notes |
|----------|---------|--------|
| `VITE_CLAW_API_BASE` or `VITE_API_BASE` | `https://<api-host>` | No trailing slash issue: code strips. Empty = same-origin (only if API is same host as SPA). |
| `VITE_LAWDOG_PRIVACY_EMAIL` | Monitored inbox | Reduces production-class warnings; see `privacyInboxDeployGuard`. |
| `VITE_CLAW_FEATURE_*` | e.g. `0` for public staging | Admin/ops UIs off unless internal-only staging. |

Secrets **do not** belong in Vite public env (they are exposed in the bundle).

### Stripe (test mode)

| Item | Value |
|------|--------|
| **Secret key** | `sk_test_...` in Stripe Dashboard; use in server env if you charge test checkouts. |
| **Webhook signing secret** | `whsec_...` → `STRIPE_WEBHOOK_SECRET` on the API. |
| **Webhook URL** | `https://<api-host>/webhook/stripe` (path from `backend/payments/stripe_webhooks.py` router) |
| **Events** | At minimum what `backend/affiliates/stripe_earnings_handlers.dispatch_stripe_event` handles (e.g. `invoice.paid`, subscription events—see that module). |

### OpenAI

| Where | Variable |
|-------|----------|
| **Backend API only** | `OPENAI_API_KEY` |

---

## Target platform: operations matrix

| Concern | Railway | Render | Fly.io | AWS (lean) |
|---------|---------|--------|--------|------------|
| **Frontend** | **Static** service or **SPA** from `dist/`, or separate **Cloudflare Pages** / **S3+CloudFront** | **Static Site** or **Web** + static | **static** machine or **Tigris** + `fly static` / nginx | **S3** + **CloudFront** (or **Amplify Hosting**) |
| **Backend** | **Service** (Docker or Nixpacks) `uvicorn backend.main:app` | **Web Service** (Docker) | **App** + ` fly deploy` | **App Runner** or **ECS Fargate** (single task) or **EC2** + ALB (smallest: App Runner) |
| **Postgres** | **Railway Postgres** plugin | **Render Postgres** | **Fly Postgres** (or **Supabase** / **Neon** external) | **RDS Postgres** (smallest `db.t4g.micro` or **Aurora Serverless v2** if you want auto-pause) |
| **TLS** | Automatic on `*.up.railway.app` / custom domain | Automatic on `onrender.com` / custom | `fly certs` / custom | ACM on CloudFront / ALB |
| **Secrets** | Service variables | Environment group | `fly secrets set` | SSM / Secrets Manager + task env |

---

## 1) Railway

1. **Postgres:** New → PostgreSQL; copy **internal** URL if API is colocated, or **public** if required.
2. **Backend service:** Connect repo, branch `feat/vs01-recipient-flow`, root or `backend` start command, e.g.:
   - `pip install -r backend/requirements.txt && uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
3. **Env:** Set `CLAW_ENVIRONMENT=staging`, `CLAW_DATABASE_URL`, `CLAW_CORS_ALLOW_ORIGINS`, `OPENAI_API_KEY`, `CLAW_ADMIN_SECRET`, `STRIPE_WEBHOOK_SECRET`, etc.
4. **Frontend:** Second service “Static” or use **Railway static** from `frontend/dist` after `npm run build` with `VITE_CLAW_API_BASE=https://<api>.up.railway.app`, **or** build in CI and deploy `dist` to any static host.
5. **DNS:** CNAME to Railway’s target; add custom domain in UI.
6. **Stripe:** Webhook URL = `https://<api-domain>/webhook/stripe`.

---

## 2) Render

1. **Postgres:** Create **PostgreSQL**; note **Internal Database URL** for co-located services.
2. **Web Service (API):** Docker or native; start `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` (Render sets `PORT`).
3. **Static Site (frontend):** Build `cd frontend && npm ci && npm run build`, publish `frontend/dist`, set env `VITE_CLAW_API_BASE` in **Environment** (Render injects at build for static—confirm **build-time** env in Render dashboard).
4. **CORS:** `CLAW_CORS_ALLOW_ORIGINS` = your static site URL.
5. **Stripe:** Same webhook path on the API service URL.

---

## 3) Fly.io

1. **Postgres:** `fly postgres create` in same org/region, or external Neon/Supabase.
2. **API:** `Dockerfile` + `fly launch`; `CMD` runs uvicorn. Set `[[services]]` internal port = 8000, map to 443.
3. **Frontend:** Option A) separate `fly` app serving nginx + `dist`; Option B) host static on Cloudflare Pages and point `VITE_CLAW_API_BASE` to `api.example.com`.
4. **Secrets:** `fly secrets set CLAW_DATABASE_URL=...` (use `?sslmode=require` if provider requires).
5. **CORS / Stripe:** Same as above.

---

## 4) AWS (lean)

Minimal path: **S3 + CloudFront** (frontend) + **App Runner** (backend) + **RDS PostgreSQL** (or **Lightsail** DB to cut cost).

1. **RDS:** Single-AZ `db.t4g.micro`, Postgres; security group only from App Runner / VPC.
2. **App Runner:** Container image with API; env from Secrets Manager; health check on `/health` or `/v1/readyz` (readiness for DB).
3. **S3/CloudFront:** Upload `dist/`; invalidation on deploy. **Build** `VITE_CLAW_API_BASE` to `https://api.<domain>`.
4. **Route 53:** A/AAAA alias to CloudFront; API subdomain to App Runner custom domain.
5. **CORS:** `CLAW_CORS_ALLOW_ORIGINS=https://<cloudfront-domain>`.

---

## DNS and domain mapping

- **App (SPA):** e.g. `app-staging.lawdog.example` → static host.
- **API:** e.g. `api-staging.lawdog.example` → API load balancer / service.
- **Stripe webhooks** must use the **public https API URL** (not internal Railway/Render hostnames if Stripe can’t reach them).
- **ACM / TLS:** Terminate at CDN (CloudFront) or platform (Fly/Railway/Render).

---

## Branch and release discipline

- Lock staging to **`feat/vs01-recipient-flow`** (or your promotion branch): tag `staging-YYYYMMDD` after green smoke.
- **Frontend:** Any API URL change **requires a new build** and redeploy of `dist/`.

---

## Smoke tests after deploy

From [DEPLOY_SMOKE_TEST](DEPLOY_SMOKE_TEST.md):

```bash
export CLAW_API_BASE=https://api-staging.yourdomain.com
export CLAW_ADMIN_SECRET='...'   # recommended
export CLAW_ENVIRONMENT=staging
# optional deeper checks:
# export CLAW_DEPLOY_SMOKE_EXTENDED=1
python3 scripts/deploy_smoke.py
```

**Manual quick checks:** open SPA origin, confirm no CORS console errors, hit login/create path, privacy footer if required.

**Frontend optional:** `CLAW_FRONTEND_URL` for a `HEAD` check in the smoke script (see deploy_smoke doc).

---

## Rollback plan

| Layer | Action |
|-------|--------|
| **Frontend** | Re-point static host to previous `dist` artifact (S3 version, Render/Rollback release, Fly `releases`) or re-deploy previous Git SHA build. |
| **Backend** | Re-deploy previous image / Git SHA; run DB migrations only if you use forward-only migration discipline (have a down strategy if you use raw SQL). |
| **Postgres** | **Before** risky releases: snapshot / backup (Render/Railway/AWS automated backups on). |
| **Stripe** | Webhook delivery logs in Dashboard; can disable endpoint temporarily. |
| **DNS** | Revert CNAME/alias to previous deployment (keep TTL low during cutover week). |

---

## Cheapest reliable path (typical)

1. **Neon** or **Supabase** free/low Postgres + **Render** free/low tier **Web Service** for API (cold starts OK for internal staging).
2. **Cloudflare Pages** (free) for **static frontend**; `VITE_CLAW_API_BASE` → Render API URL.
3. **Stripe** test mode only; one webhook endpoint.
4. **CORS:** explicit `CLAW_CORS_ALLOW_ORIGINS` to your Pages URL.

Tradeoff: cold starts, region latency; fine for **staging / demos**.

---

## Fastest path to a live demo

1. **Render (or Railway) all-in-one:** Create Postgres + API in ~30–60 min; set env; deploy branch `feat/vs01-recipient-flow`.
2. **Frontend:** If platform supports static, add second service; **otherwise** `npx vercel` / **Cloudflare Pages** CLI with one env var and connect to API URL.
3. **CORS + Stripe URL** first; then `deploy_smoke.py` with `CLAW_ADMIN_SECRET`.
4. **Skip** worker/anchor until the demo path is: **app → API → OpenAI** + optional **test checkout** on Stripe test keys.

**Do not** set `CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED=1` on public staging; it only applies to relaxed envs, but keep it off for clarity.

---

## One-page staging env checklist (copy to ticket)

- [ ] `CLAW_ENVIRONMENT=staging`
- [ ] `CLAW_DATABASE_URL` (Postgres live, `SELECT 1` from app)
- [ ] `CLAW_CORS_ALLOW_ORIGINS` = exact SPA origin(s)
- [ ] `OPENAI_API_KEY` on API
- [ ] `STRIPE_WEBHOOK_SECRET` + Stripe Dashboard → `https://<api>/webhook/stripe`
- [ ] `CLAW_ADMIN_SECRET` set; admin routes tested with header
- [ ] Frontend build: `VITE_CLAW_API_BASE` / `VITE_LAWDOG_PRIVACY_EMAIL` as required
- [ ] `python3 scripts/deploy_smoke.py` green
- [ ] No production Stripe/OpenAI keys on staging (rotate if leaked)

---

## Related code pointers

- CORS: `backend/main.py` — `_cors_origins`
- API base (frontend): `frontend/src/lib/clawApi.ts` — `VITE_CLAW_API_BASE` / `VITE_API_BASE`
- Stripe webhooks: `backend/payments/stripe_webhooks.py` — `POST /webhook/stripe`
- Stripe dev-unsigned safety: `CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED` + relaxed env only (`local`/`dev`/`test`)
