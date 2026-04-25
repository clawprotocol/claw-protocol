# Deploy smoke test

Short validation after shipping **frontend + API + worker + DB + storage** so obvious breakage is caught before users do.

**Automated (HTTP):** `python3 scripts/deploy_smoke.py` runs the **canonical launch order** (below).  
**Deeper agreement flow (render/export):** `python3 scripts/smoke_agreements_v2.py` after the core script passes.  
**Manual UX:** recipient links, signing UI, finalize/send — checklist §§F–H.

Related: [Launch operator playbook](LAUNCH_OPERATOR_PLAYBOOK.md) (staging → launch timeline), [Operator runbook](OPERATOR_RUNBOOK.md), [Env topology](../architecture/ENV_TOPOLOGY.md), [Launch database profile](LAUNCH_DATABASE_PROFILE.md) (single-DSN default), [Pre-launch load test plan](PRE_LAUNCH_LOAD_TEST_PLAN.md) (flow-based staging load; `scripts/loadtest/`).

---

## Canonical launch validation order (automated)

Run **`make deploy-smoke`** or **`python3 scripts/deploy_smoke.py`** with `CLAW_API_BASE` set. Recommended: set **`CLAW_ADMIN_SECRET`** so steps 3 and 6 run.

| Step | What | Pass |
|------|------|------|
| **1** | `GET /health` | 200, `ok: true` |
| **2** | `GET /v1/readyz` | 200, `ok: true` (503 = Postgres/readiness failure) |
| **3** | `GET /admin/deploy-readiness` | 200, top-level `ok: true` (exit **2** if critical checks fail); prints `checks` JSON |
| **4** | Agreement API (optional) | `CLAW_DEPLOY_SMOKE_AGREEMENT_WRITE=1`: parse + draft. **`CLAW_DEPLOY_SMOKE_EXTENDED=1`**: also `update-field` |
| **5** | Timeline / proof spine API (optional) | **`CLAW_DEPLOY_SMOKE_EXTENDED=1`**: `POST /v1/timelines` + `GET .../events` |
| **6** | Operator / anchor summary | From step 3: `checks.anchoring_operator_summary` present and not `status: error` (warn unless `CLAW_DEPLOY_SMOKE_FAIL_ON_OPERATOR_SUMMARY=1`) |

**After** the numbered steps, the script still hits: `GET /version`, feed public, access policy/validate, public verify route, `GET /v1/healthz` (LB alias), optional frontend `HEAD`.

**Staging one-liner (recommended):**

```bash
export CLAW_API_BASE=https://staging-api.example.com
export CLAW_ADMIN_SECRET='...'
export CLAW_DEPLOY_SMOKE_EXTENDED=1
python3 scripts/deploy_smoke.py
```

---

## Preconditions

- **LawDog production frontend:** CI/build should set **`VITE_LAWDOG_PRIVACY_EMAIL`** to the live privacy/data-rights mailbox; after deploy, spot-check **`/privacy#privacy-contact`** (and browser console should be clean of the missing-inbox operator warning). See **`docs/DEPLOY.md`** (LawDog frontend — privacy / data-rights inbox).
- API URL known (`CLAW_API_BASE`).
- For admin JSON: `CLAW_ADMIN_SECRET` and header **`x-claw-admin-secret`** (see `backend/main.py`).
- Worker is **not required** for smoke to pass; queue depth is **reported**, not drained.
- **No step here intentionally broadcasts** mainnet/testnet anchors.

---

## Environment profiles (safety)

| `CLAW_ENVIRONMENT` | Default `CLAW_DEPLOY_SMOKE_PROFILE` | Artifact round-trip via `/admin/deploy-readiness` |
|--------------------|-------------------------------------|---------------------------------------------------|
| `production` / `prod` | `read_only` | **Skipped** unless `CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP=1` |
| Other (local, staging, dev, test) | `standard` | **On** unless `CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP=0` |
| Any | `deep` if `CLAW_DEPLOY_SMOKE_PROFILE=deep` | **On** (unless explicitly disabled) |

Overrides:

- `CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP=1` — force artifact put/get/delete smoke (use sparingly in prod).
- `CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP=0` — never write artifact test blobs.
- `CLAW_DEPLOY_SMOKE_AGREEMENT_WRITE=1` — **`scripts/deploy_smoke.py`** runs agreement `parse` + `draft` only. **Blocked in production** unless `CLAW_DEPLOY_SMOKE_I_UNDERSTAND_PRODUCTION_WRITES=1`.
- `CLAW_DEPLOY_SMOKE_EXTENDED=1` — same prod guard; runs **parse + draft + update-field + timeline create/list** (steps 4–5). Implies deeper DB/timeline writes; use on **staging** before launch.
- `CLAW_DEPLOY_SMOKE_FAIL_ON_OPERATOR_SUMMARY=1` — exit **1** if `anchoring_operator_summary` is missing or `status: error` (default is warn only).

**Mainnet:** smoke does not call `POST /admin/anchor/run`. RPC checks use **`getblockchaininfo`** only (read-only).

---

## Automated: `scripts/deploy_smoke.py`

```bash
export CLAW_API_BASE=https://your-api.example.com
export CLAW_ADMIN_SECRET='your-admin-secret'   # recommended (steps 3 + 6)
export CLAW_FRONTEND_URL=https://your-app.example.com   # optional HEAD

python3 scripts/deploy_smoke.py
# staging: add extended agreement + timeline smoke
# CLAW_DEPLOY_SMOKE_EXTENDED=1 python3 scripts/deploy_smoke.py
```

**Covers (HTTP)** — see [Canonical launch validation order](#canonical-launch-validation-order-automated) first. Additional probes:

| Surface | Pass criteria |
|---------|----------------|
| API liveness (step 1) | `GET /health` → `ok` |
| API readiness (step 2) | `GET /v1/readyz` → **200** and JSON `ok: true` (503 if **any configured** launch Postgres domain is unreachable; see `POSTGRES_DAY_ONE.md`) |
| Admin aggregate (step 3) | `GET /admin/deploy-readiness` → 200, `ok: true` |
| Build info | `GET /version` → 200 |
| Liveness alias | `GET /v1/healthz` → `ok` |
| Public feed | `GET /api/feed/public` → 200 **or** 404 if feed API disabled |
| Recipient policy | `GET /api/agreements/access/policy` → 200 |
| Recipient token handling | `GET .../access/validate?token=not-a-valid-token` → client error (not 503 unless signing secret missing server-side) |
| Public verify route | `GET /api/agreements/public/__smoke_missing__/verify` → 404 or 200 (route must respond, not 5xx) |
| Frontend (optional) | `HEAD` `CLAW_FRONTEND_URL` → &lt; 400 |

Exit **2** if `/admin/deploy-readiness` returns `"ok": false`. Exit **1** on hard HTTP failures or (if set) operator summary strict mode.

---

## Server-side: `GET /admin/deploy-readiness`

Returns JSON (no secrets):

- **SQLite pings:** timeline, usage/anchor queue, feed, treasury, artifact registry (if unified store on).
- **Postgres launch domains:** when a domain uses Postgres, the matching **`checks.*_postgresql`** key must be `ok`. Subset of these match `GET /v1/readyz`; **usage_economics_postgresql** is deploy-readiness only.
- **Treasury:** simple query against `claw_keys` (schema / connectivity).
- **Queues:** proof anchor queue pending count; timeline OP_RETURN job queue length (informational).
- **RPC:** if `BITCOIN_RPC_URL` / `DOGECOIN_RPC_URL` set → **`getblockchaininfo`** only; if unset → `not_configured`.
- **Artifact round-trip:** uses `ArtifactRepository` + `BlobStore` (skipped in `read_only` profile unless forced; **`ObjectStoreStub`** surfaces `not_implemented` honestly).

Use this from the **API pod** (same env as customers’ HTTP traffic). RPC from the API host may differ from the worker host—if your worker runs elsewhere, also run RPC checks from that network context when debugging anchors.

---

## Manual checklist (production-friendly)

Run these when you need **UI** or **full recipient/signing** confidence.

### A. Frontend

1. Open app root → shell loads without blank screen.
2. Open a major route (e.g. agreements workspace / feed if you use them).
3. **Fail:** blank page, wrong `VITE_API_BASE` / CORS errors in console.

### B. API (curl)

1. `curl -fsS "$CLAW_API_BASE/health"`
2. `curl -fsS "$CLAW_API_BASE/v1/readyz"` (expect HTTP 200 when configured Postgres domains are healthy; **503** if any probe fails)
3. `curl -fsS -H "x-claw-admin-secret: $CLAW_ADMIN_SECRET" "$CLAW_API_BASE/admin/deploy-readiness" | jq .ok,.failed_critical_checks`
4. `curl -fsS "$CLAW_API_BASE/version" | jq .anchor`
5. **Fail:** timeouts, 5xx (including **503** on `/v1/readyz` when a configured Postgres domain is unreachable).

### C. Database

Rely on **`GET /v1/readyz`** (anchoring Postgres ping when configured), **`/admin/deploy-readiness`** timeline/treasury/usage/feed pings, or watch API logs on startup for SQLite errors.

### D. Storage

- Non-prod or `CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP=1`: readiness JSON → `checks.artifact_storage_round_trip.status == ok`.
- Object backend stub: expect `not_implemented` until S3-backed adapter ships—plan around that for go-live.

### E. Agreement flow

- **Automated (core):** `CLAW_DEPLOY_SMOKE_EXTENDED=1` or `CLAW_DEPLOY_SMOKE_AGREEMENT_WRITE=1` via `scripts/deploy_smoke.py` (non-prod unless force env set).
- **Automated (deeper):** `python3 scripts/smoke_agreements_v2.py` — parse, draft, update-field, render, export-docx, GET agreement.
- **Send / finalize:** manual checklist §G or product-specific E2E (not in default deploy smoke).
- **Manual:** create draft in UI, reload workspace.

### F. Recipient magic link

1. Mint token (API with mint key): `POST /api/agreements/{id}/recipient-access-token` (see tests for shape).
2. Open recipient URL with `t=` in browser → review/signer shell loads for **valid** token.
3. **Invalid/expired:** safe error (no stack traces to user).
4. **Automated:** script only checks invalid token path; full mint flow stays manual or integration test.

### G. Signing / finalization

**Manual:** run one internal test agreement through lock → sign → finalize; confirm completed view and execution packet UI. (Too brittle for default curl smoke.)

### H. Proof / feed / verify

1. `GET /api/feed/public` when feed enabled.
2. `GET /api/agreements/public/{real_id}/verify` for a known agreement.
3. Proof status: poll `GET /api/agreements/{id}/proof-status` after finalize (worker may lag—**not** a failure if still `queued` briefly).
4. **Worker:** optionally run `python -m backend.workers.run_anchor_worker` once in staging and confirm JSON summary has sensible counters (no crash).

### I. Treasury / CLAW Key

- Readiness **`treasury_spine`** must be `ok`.
- Payment pipeline: use your existing staging payment simulation; confirm ledger events if you have a dev hook—**out of scope** for this minimal smoke doc.

---

## Failure interpretation (quick)

| Symptom | Likely cause |
|---------|----------------|
| `deploy-readiness` `timeline_db` error | Wrong/missing volume, permissions, `CLAW_TIMELINE_DB_PATH` |
| `bitcoin_rpc` error but URL set | Firewall, auth, wallet not loaded on **API** host |
| `artifact_storage_round_trip` `not_implemented` | `CLAW_STORAGE_BACKEND` is object stub—implement or stay on local |
| `access/validate` 503 | `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` unset on server |
| `/v1/readyz` 503 or `anchoring_postgresql` error | Wrong DSN, security group / VPC, credentials, or Postgres unavailable |
| Feed 404 | `CLAW_FEED_PUBLIC_API_ENABLED=0` (may be intentional) |
| Script exit 2, `ok: false` | Inspect `failed_critical_checks` in JSON |

---

## Go-live risks still on the operator

- Worker cron not scheduled → anchors stall (queues visible, no txids).
- API and worker using **different** `CLAW_DATA_DIR` / DB paths → split brain.
- Production **`CLAW_ADMIN_SECRET`** unset → admin endpoints open (see runbook).
- Browser **`VITE_CLAW_API_BASE`** / **`VITE_API_BASE`** mis-set → UI talks to wrong host.

---

## Makefile

```bash
make deploy-smoke
```

Runs `scripts/deploy_smoke.py` with your current shell env.

---

## On-box JSON (API process env)

From the repo with backend imports available:

```bash
python3 -m backend.ops.deploy_readiness
```

Prints the same structure as `GET /admin/deploy-readiness` (uses the local process environment). Exit code **2** if `ok` is false—useful on a host that cannot reach its own public URL.
