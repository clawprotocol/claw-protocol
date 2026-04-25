# Launch operator playbook (LawDog)

**Chronological** checklist for staging validation and launch day—copy/paste friendly.  
**Policy, access, ethics, deep env tables:** [Operator runbook](OPERATOR_RUNBOOK.md), [Environment topology](../architecture/ENV_TOPOLOGY.md), [Launch database profile](LAUNCH_DATABASE_PROFILE.md).

---

## 0. Env / profile assumptions (confirm first)

Staging and production-like runs should match this baseline before you rely on checks below.

- [ ] **`CLAW_ENVIRONMENT`** — non-local label (`staging`, `production`, …).
- [ ] **Postgres** — prefer one **`CLAW_DATABASE_URL` / `DATABASE_URL`**; avoid per-store DSN sprawl unless intentional ([Launch database profile](LAUNCH_DATABASE_PROFILE.md)).
- [ ] **`CLAW_ADMIN_SECRET`** — set on shared APIs; admin calls use **`x-claw-admin-secret`**.
- [ ] **`CLAW_DEBUG`** — off in production-like environments.
- [ ] **CORS** — **`CLAW_CORS_ALLOW_ORIGINS`** explicit list; matches real browser origins.
- [ ] **Frontend** — **`VITE_API_BASE`** correct for same-origin vs split-origin at **build** time.
- [ ] **Recipient links** — **`CLAW_AGREEMENT_SIGNING_TOKEN_SECRET`** set; **`CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED=1`** if launch policy requires `t=` tokens.
- [ ] **Worker** — same DB / storage / critical env as API; **`CLAW_ANCHORING_ENABLED=1`** if receipt-batch anchoring applies; worker scheduled: `python -m backend.workers.run_anchor_worker`.
- [ ] **Secrets** — in a secrets manager, not tickets or chat.

---

## 1. Staging validation order

Complete each step before the next. Fix failures at the source (config, DB, deploy), not by weakening checks.

**1.1 Build gate**

```bash
make validate
```

**1.2 Manual product smoke** (browser)

Follow [LAUNCH_SMOKE_CHECKLIST.md](../LAUNCH_SMOKE_CHECKLIST.md) on staging: home, app entry, create agreement, e-sign, billing, gates.

**1.3 Recipient realism**

Create an agreement → open a **recipient link** → perform **one** recipient action (e.g. approve / signing step) with the same token policy you plan for launch.

**1.4 Automated HTTP smoke** (ordered gates)

```bash
export CLAW_API_BASE=https://staging-api.example.com
export CLAW_ADMIN_SECRET='…'
# Optional on staging: agreement parse/draft/update + timeline API
export CLAW_DEPLOY_SMOKE_EXTENDED=1

make deploy-smoke
# equivalent: python3 scripts/deploy_smoke.py
```

Canonical order: **`GET /health`** → **`GET /v1/readyz`** → **`GET /admin/deploy-readiness`** → optional agreement/timeline writes → **`checks.anchoring_operator_summary`** (from deploy-readiness). Details: [DEPLOY_SMOKE_TEST.md](DEPLOY_SMOKE_TEST.md).

**1.5 Deeper agreement API** (if you need render/export beyond the smoke script)

```bash
python3 scripts/smoke_agreements_v2.py
```

(Configure per that script’s README / env; run only after **1.4** passes.)

---

## 2. Load-test sequence (staging)

**Never** set `CLAW_LOAD_ALLOW_WRITES=1` against production unless you explicitly accept the data and risk.

```bash
export CLAW_API_BASE=https://staging-api.example.com

# Read-heavy (safe on most environments)
python3 scripts/loadtest/run_flow_loadtest.py --scenario read --workers 25 --requests 250

# Writes — staging only
export CLAW_LOAD_ALLOW_WRITES=1
export CLAW_SMOKE_ORG_ID=staging-loadtest-org
python3 scripts/loadtest/run_flow_loadtest.py --scenario quick_send --workers 10 --requests 80

# Operator route (needs admin secret)
export CLAW_ADMIN_SECRET='…'
python3 scripts/loadtest/run_flow_loadtest.py --scenario operator --workers 4 --requests 20
```

**Exit codes:** `0` = survival + good UX; `1` = survival OK, UX miss; `2` = survival miss. Tune **`CLAW_LOAD_SURVIVAL_*`** / **`CLAW_LOAD_UX_*`**. See [PRE_LAUNCH_LOAD_TEST_PLAN.md](PRE_LAUNCH_LOAD_TEST_PLAN.md) and `scripts/loadtest/README.md`.

---

## 3. Launch-day checks (immediately after cutover)

| Order | What |
|------|------|
| 1 | **`GET /health`** — liveness; read `summary` if present. |
| 2 | **`GET /v1/readyz`** — **200**, `ok: true` (503 = configured Postgres domain problem). |
| 3 | **`GET /admin/deploy-readiness`** — **200**, top-level **`ok: true`**; scan **`summary.headline`**, **`failed_critical_checks`**, **`checks`**. |
| 4 | **`GET /version`** — environment, node mode, anchor / mainnet flags match intent. |
| 5 | **Worker** — latest scheduled run **exit 0**; logs not in a crash loop. |
| 6 | **SPA + policy** — app loads; **`GET /api/agreements/access/policy`** matches minted links and strict flags. |

One shell block (set `API` and `CLAW_ADMIN_SECRET`):

```bash
export API=https://api.example.com
curl -fsS "$API/health" | jq .
curl -fsS "$API/v1/readyz" | jq .
curl -fsS -H "x-claw-admin-secret: $CLAW_ADMIN_SECRET" "$API/admin/deploy-readiness" | jq .ok,.summary,.failed_critical_checks
curl -fsS "$API/version" | jq .environment,.node_mode,.anchor
```

---

## 4. First-hours monitoring priorities

| Priority | Watch |
|----------|--------|
| 1 | **503 rate on `/v1/readyz`** + DB connections / replication lag (provider metrics). |
| 2 | **5xx and timeouts** by route in app logs; **error rate up with flat CPU** → suspect DB pool / locks. |
| 3 | **Worker + anchoring** — scheduled runs; deploy-readiness **`anchoring_operator_summary`** / runway signals. |
| 4 | **Recipient/CORS regressions** — wrong `VITE_API_BASE` or CORS after deploy. |

Avoid prod **write** load tests during first hours unless planned.

---

## 5. Rollback / pause (high level)

| Situation | Action |
|-----------|--------|
| **Bad build** | Roll API **and** worker to last known-good artifact; align with **migration** policy (forward-only vs rollback—decide **before** launch). |
| **Readiness / DB red** | **Pause** user-visible writes (maintenance page, LB drain, or edge block) until **`readyz`** and deploy-readiness **critical** checks recover. |
| **Anchoring or chain degraded** | Tighten **external** promises (marketing/support); follow [ANCHORING_LAUNCH_RUNBOOK.md](ANCHORING_LAUNCH_RUNBOOK.md). |
| **Secret compromise** | Rotate **`CLAW_ADMIN_SECRET`**, signing/mint secrets, RPC credentials; follow incident process. |

**Exceptional access to user content:** break-glass only, reason-coded, logged — [OPERATOR_ACCESS_POLICY.md](OPERATOR_ACCESS_POLICY.md).

---

## Quick links

| Topic | Document |
|--------|-----------|
| Full operator posture | [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md) |
| Deploy smoke (detail) | [DEPLOY_SMOKE_TEST.md](DEPLOY_SMOKE_TEST.md) |
| Load testing | [PRE_LAUNCH_LOAD_TEST_PLAN.md](PRE_LAUNCH_LOAD_TEST_PLAN.md) |
| Anchoring | [ANCHORING_LAUNCH_RUNBOOK.md](ANCHORING_LAUNCH_RUNBOOK.md) |
| Env by process | [ENV_TOPOLOGY.md](../architecture/ENV_TOPOLOGY.md) |
| Manual UX checklist | [LAUNCH_SMOKE_CHECKLIST.md](../LAUNCH_SMOKE_CHECKLIST.md) |

---

*Internal. Update after each launch or major topology change.*
