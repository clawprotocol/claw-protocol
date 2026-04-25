# Flow load test (pre-launch)

Small HTTP driver for **realistic multi-step flows** — see **`docs/ops/PRE_LAUNCH_LOAD_TEST_PLAN.md`**.

Pass/fail uses **two threshold tiers**: **survival** (no collapse / tolerable errors) vs **good UX** (reasonable route latencies). Exit **2** = survival miss, **1** = UX-only miss.

## Requirements

- Python 3.10+
- `pip install requests` (same as `scripts/deploy_smoke.py`)

## Quick start

From repo root:

```bash
export CLAW_API_BASE=https://your-staging-api.example.com

# Read-only (safe on most environments)
python3 scripts/loadtest/run_flow_loadtest.py --scenario read --workers 25 --requests 250

# Optional: hit public verify for one fixture agreement
export CLAW_LOAD_PUBLIC_AGREEMENT_ID=<stable-staging-agreement-uuid>

# Operator route (needs admin secret)
export CLAW_ADMIN_SECRET=...
python3 scripts/loadtest/run_flow_loadtest.py --scenario operator --workers 4 --requests 20
```

## Write scenarios (staging only)

```bash
export CLAW_LOAD_ALLOW_WRITES=1
export CLAW_SMOKE_ORG_ID=my-loadtest-org   # suffix adds -wN-sM per request

python3 scripts/loadtest/run_flow_loadtest.py --scenario quick_send --workers 10 --requests 80
python3 scripts/loadtest/run_flow_loadtest.py --scenario builder --workers 6 --requests 36
python3 scripts/loadtest/run_flow_loadtest.py --scenario mixed --workers 15 --requests 120
```

## Campaign-style mix (mostly read, some writes)

```bash
export CLAW_LOAD_ALLOW_WRITES=1
export CLAW_LOAD_CAMPAIGN_READ_RATIO=0.94
python3 scripts/loadtest/run_flow_loadtest.py --scenario campaign --workers 40 --requests 400
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `CLAW_API_BASE` | API origin |
| `CLAW_SMOKE_ORG_ID` | Base org id for `X-Claw-Org-Id` (per-request suffix added) |
| `CLAW_LOAD_TIMEOUT` / `CLAW_SMOKE_TIMEOUT` | Per-request timeout (seconds) |
| `CLAW_LOAD_ALLOW_WRITES` | Must be `1` / `true` / `yes` for write scenarios |
| `CLAW_LOAD_PUBLIC_AGREEMENT_ID` | Enables `GET /api/agreements/public/{id}/verify` in `read` flow |
| `CLAW_ADMIN_SECRET` | Enables `operator` scenario |
| `CLAW_FRONTEND_URL` | Not used by harness yet; plan doc suggests manual HEAD |
| `CLAW_LOAD_CAMPAIGN_READ_RATIO` | `campaign` scenario: fraction of read-only flows (0–1) |

### Thresholds (two tiers, unless `--no-thresholds`)

The harness evaluates **survival** first (did the stack stay up with tolerable errors?), then **good UX**
(reasonable latency for real routes — not benchmark bragging rights).

**Exit codes:** `0` = both pass · `1` = survival pass, good-UX fail · `2` = survival fail.

**Survival** (loose — collapse detection):

| Variable | Default | Meaning |
|----------|---------|---------|
| `CLAW_LOAD_SURVIVAL_MAX_ERROR_RATE` | `0.05` | Max error rate per label |
| `CLAW_LOAD_SURVIVAL_P95_MS_READ` | `12000` | Any `read:*` step |
| `CLAW_LOAD_SURVIVAL_P95_MS_AGREEMENT` | `45000` | Any `agreement:*` step |
| `CLAW_LOAD_SURVIVAL_P95_MS_OPERATOR` | `45000` | `operator:*` |

**Good UX** (route-aware where it matters — tune for staging region/size):

| Variable | Default | Labels |
|----------|---------|--------|
| `CLAW_LOAD_UX_MAX_ERROR_RATE` | `0.02` | Per label (max of `CLAW_LOAD_MAX_ERROR_RATE` if `CLAW_LOAD_UX_*` unset) |
| `CLAW_LOAD_UX_P95_MS_READ_LIGHT` | `1000` | `read:/v1/healthz`, `read:/v1/version` |
| `CLAW_LOAD_UX_P95_MS_READ_READYZ` | `2500` | `read:/v1/readyz` |
| `CLAW_LOAD_UX_P95_MS_READ` | `2500` | Other `read:*` (public verify, etc.) |
| `CLAW_LOAD_UX_P95_MS_AGREEMENT` | `12000` | `agreement:parse`, `draft`, `update-field`, … |
| `CLAW_LOAD_UX_P95_MS_RENDER` | `max(agreement, 18000)` | `agreement:render` |
| `CLAW_LOAD_UX_P95_MS_PROOF` | `8000` | `agreement:proof-status` |
| `CLAW_LOAD_UX_P95_MS_AGREEMENT_GET` | `5000` | `agreement:get` |
| `CLAW_LOAD_UX_P95_MS_OPERATOR` | `15000` | `operator:deploy-readiness` |

**Legacy overrides** (still supported; apply to **good UX** tier only): `CLAW_LOAD_MAX_ERROR_RATE`,
`CLAW_LOAD_P95_MS_READ`, `CLAW_LOAD_P95_MS_AGREEMENT`, `CLAW_LOAD_P95_MS_OPERATOR`.

Longest label prefix wins (e.g. `read:/v1/readyz` before `read:`).

## JSON output

```bash
python3 scripts/loadtest/run_flow_loadtest.py --scenario read --workers 10 --requests 100 \
  --json-out /tmp/load_read.json
```

## Scenarios

| Name | Description |
|------|-------------|
| `read` | healthz, version, readyz; optional public verify |
| `quick_send` | parse → draft → 1× update → render → get |
| `builder` | parse → draft → 5× update → render → proof-status |
| `operator` | GET `/admin/deploy-readiness` |
| `mixed` | Random mix of read, quick_send, operator |
| `campaign` | High read ratio + occasional quick_send |
