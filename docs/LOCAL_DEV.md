# LawDog Local Development

## Prerequisites

- Python 3.11+
- Node 20+
- Optional: Docker (API image only)

## Quick start

```bash
# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add OPENAI_API_KEY as needed
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Frontend (separate terminal)
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` — Vite proxies `/v1`, `/api`, `/health` to port 8000.

## API base URL

Dev default: frontend calls `http://127.0.0.1:8000` when `VITE_CLAW_API_BASE` is unset.

Optional `frontend/.env.local`:

```bash
VITE_CLAW_API_BASE=http://127.0.0.1:8000
VITE_CLAW_SUPPRESS_API_BASE_LOG=1
```

## Anonymous free UX

No env vars required for starter drafting. Genesis Referral and Stripe are optional in local dev.

## Stripe webhooks locally

```bash
stripe listen --forward-to localhost:8000/webhook/stripe
# Set STRIPE_WEBHOOK_SECRET from stripe listen output
```

Or (dev only): `CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED=1` with `CLAW_ENVIRONMENT=local`.

## Postgres locally (optional)

```bash
export CLAW_DATABASE_URL=postgresql://user:pass@localhost:5432/lawdog
export CLAW_USE_POSTGRESQL=1   # see backend/db/config.py for domain flags
```

## Health checks

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/v1/readyz
```

## Tests

```bash
.venv/bin/pytest backend/tests/test_genesis_referral.py -q
cd frontend && npm run test
cd frontend && npx tsc --noEmit
```

## Docker (API only)

```bash
docker build -t lawdog-api .
docker run -p 8080:8080 -e CLAW_ENVIRONMENT=local -e OPENAI_API_KEY=sk-... lawdog-api
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| CORS errors | Use Vite dev server (proxy) or set `CLAW_CORS_ALLOW_ORIGINS` |
| API unreachable banner | Start backend; check `VITE_CLAW_API_BASE` |
| Production API URL in dev build | Remove hardcoded `index.html` scripts; use env only |

See also: `docs/DEV.md`, `docs/ENVIRONMENT.md`, `docs/DEPLOYMENT.md`.
