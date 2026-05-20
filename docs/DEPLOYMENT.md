# LawDog Deployment Guide

Portable deploy targets: **Docker**, **Railway**, **Render**, **Fly.io**, **Vercel** (frontend) + external API, or future AWS (same containers).

Product behavior (anonymous free UX, Genesis Referral, Stripe) is unchanged — this doc covers **how to run** the stack.

## Architecture (split-ready)

| Component | Default | Notes |
|-----------|---------|--------|
| API | `backend.main:app` (FastAPI/uvicorn) | Port from `PORT` (default `8080`) |
| SPA | `frontend/dist` static | Build with `npm run build` |
| Worker | `python -m backend.workers.run_anchor_worker` | Separate process; optional at launch |
| Database | SQLite (dev) or Postgres (`CLAW_DATABASE_URL`) | Supabase = hosted Postgres via DSN |

**Same-origin:** API + SPA on one host — leave `VITE_CLAW_API_BASE` unset; browser uses relative URLs.

**Split-origin:** Static SPA (Vercel, S3, Railway static) + API host — set `VITE_CLAW_API_BASE=https://api.example.com` at **build time** and `CLAW_CORS_ALLOW_ORIGINS=https://app.example.com` on the API.

## API (container / PaaS)

### Build & run

```bash
docker build -t lawdog-api .
docker run -p 8080:8080 \
  -e CLAW_ENVIRONMENT=production \
  -e CLAW_CORS_ALLOW_ORIGINS=https://app.example.com \
  -e CLAW_DATABASE_URL=postgresql://... \
  -e OPENAI_API_KEY=sk-... \
  -e STRIPE_WEBHOOK_SECRET=whsec_... \
  -e CLAW_ADMIN_SECRET=... \
  -e CLAW_AGREEMENT_SIGNING_TOKEN_SECRET=... \
  lawdog-api
```

Startup command (explicit):

```bash
uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
```

### Health checks

| Path | Use |
|------|-----|
| `GET /health` | Liveness (process up) |
| `GET /v1/readyz` | Readiness (Postgres domains when configured) |
| `GET /version` | Build/deploy metadata |

Railway: `healthcheckPath = "/health"` in `railway.toml`.

Post-deploy smoke: `make deploy-smoke` or `scripts/deploy_smoke.py` (see `docs/ops/DEPLOY_SMOKE_TEST.md`).

### Persistent disk

Mount a volume at `CLAW_DATA_DIR` (default `/var/lib/claw` or `~/.claw`) for SQLite, blobs, and timeline DB when not using external Postgres for all domains.

## Frontend (static)

```bash
cd frontend
export VITE_CLAW_API_BASE=https://your-api.example.com   # split deploy
export VITE_LAWDOG_PRIVACY_EMAIL=privacy@example.com      # required for production LawDog
npm ci && npm run build
# Serve dist/ with any static host
```

**Vercel:** Root directory `frontend`, build `npm run build`, output `dist`. Set env vars in project settings (all `VITE_*` are build-time).

**Do not** commit production API URLs in `index.html` — use `VITE_CLAW_API_BASE` or `<meta name="claw-api-base">` at deploy time.

## Platform notes

### Railway

- API: repo root `Dockerfile` + `railway.toml`
- Frontend: `frontend/railway.toml` (preview) or build `dist` elsewhere
- Set all secrets in Railway dashboard (never in git)

### Render

- Web Service → Docker or `uvicorn` start command
- Health check path: `/health`
- Attach persistent disk for `CLAW_DATA_DIR` if using SQLite

### Fly.io

```bash
fly launch
fly secrets set CLAW_ENVIRONMENT=production CLAW_CORS_ALLOW_ORIGINS=...
fly deploy
```

Internal port must match `PORT` (8080).

### Stripe webhooks

Point Stripe to `https://<api-host>/webhook/stripe`. Set `STRIPE_WEBHOOK_SECRET` on the API service only.

Idempotency: duplicate `event.id` returns `{duplicate: true}` without double-processing.

## Recovery / redeploy

1. Check `GET /health` and `GET /v1/readyz`
2. Review API logs for `[env]` warnings at startup
3. Re-run frontend build if `VITE_*` changed (build-time vars)
4. Verify CORS: browser preflight from app origin to API

## Post-deploy verification

**Canonical checklist:** `docs/RELEASE_CHECKLIST.md`

**Automated:**

```bash
export CLAW_API_BASE=https://<api-host>
export CLAW_FRONTEND_URL=https://<app-host>
export CLAW_ADMIN_SECRET=...
python3 scripts/release_smoke.py
```

### Genesis schema on startup

1. **SQLite (always):** `EconomicsStore.init_schema()` → `ensure_genesis_referral_schema()` on `CLAW_ECONOMICS_DB_PATH` / `CLAW_DATA_DIR/economics.sqlite3`.
2. **Postgres affiliate ledger (optional):** when affiliate ledger Postgres is enabled, `ensure_affiliate_ledger_schema()` applies `migrations/postgres/001` … `004_genesis_referral_access.sql` in lexical order.

Persist `CLAW_DATA_DIR` (or `CLAW_ECONOMICS_DB_PATH`) on Railway volume for Genesis attribution/commission durability.

## Related docs

- `docs/RELEASE_CHECKLIST.md` — post-deploy steps (health, Genesis, Stripe, ops)
- `docs/ENVIRONMENT.md` — variable reference
- `docs/LOCAL_DEV.md` — local development
- `docs/DEPLOY.md` — legacy security/path notes
- `docs/architecture/ENV_TOPOLOGY.md` — full env index
