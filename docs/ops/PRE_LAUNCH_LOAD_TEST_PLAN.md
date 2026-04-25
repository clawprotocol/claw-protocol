# Pre-launch load test plan (LawDog)

Practical, **flow-based** validation before public traffic — not vanity benchmark scores. Goal is to see whether **real sequences** (reads + agreement writes + operator visibility) stay healthy on **lean managed Postgres** and provider-backed anchoring, and to spot **DB or concurrency cliffs** early.

**Harness:** `scripts/loadtest/run_flow_loadtest.py` + `scripts/loadtest/README.md`.  
**Where this fits:** [Launch operator playbook](LAUNCH_OPERATOR_PLAYBOOK.md) (staging → load test → launch day).  
**Complements:** [Deploy smoke](DEPLOY_SMOKE_TEST.md) (correctness) and provider dashboards (CPU, connections, replication lag).

---

## 1. Test objectives

| # | Objective | What “good” means |
|---|-----------|-------------------|
| 1 | Core UX stays fast under **bursty** realistic load | p95 for public/read routes within agreed budget; no systemic timeouts. |
| 2 | **Write-heavy** agreement paths do not collapse | Parse/draft/update/render degrade gracefully; error rate stays low; no connection storms. |
| 3 | **Affiliate / payout / onramp** traffic does not destabilize the API | Mixed scenario + optional manual payout webhook simulation; DB stable; no domino 503s. |
| 4 | **Operator** routes stay usable under load | `/admin/deploy-readiness` (with secret) remains callable; latency bounded. |
| 5 | No obvious **DB/concurrency cliff** at early-launch scale | Postgres `max_connections` headroom; no sustained `readyz` failures unless DB is actually down. |

---

## 2. Flows to test

### A. Read-heavy traffic

- **Routes (harness):** `GET /v1/healthz`, `GET /v1/version`, `GET /v1/readyz`.
- **Add manually or extend harness:** static **homepage / app shell** (`HEAD` or `GET` frontend origin), **affiliate landing** (if separate static or BFF route), **public verify** `GET /api/agreements/public/{id}/verify` (set `CLAW_LOAD_PUBLIC_AGREEMENT_ID` to a stable fixture agreement).
- **Intent:** CDN/cache misses + API read path; **`readyz`** reflects DB pressure (do not tune app to “hide” `503` from `readyz` without fixing the cause).

### B. Quick send burst

- **Sequence:** `POST /api/agreements/parse` → `POST /api/agreements/draft` → one `POST .../update-field` → `POST .../render` → `GET .../{id}`.
- **Harness scenario:** `quick_send` (requires `CLAW_LOAD_ALLOW_WRITES=1`).
- **Vary:** concurrency (e.g. 5–20 workers), total invocations (e.g. 50–200), **distinct `X-Claw-Org-Id`** per worker/seq (harness does this) to reduce artificial contention on one org quota.

### C. Agreement builder flow

- **Sequence:** parse → draft → **3–5** `update-field` calls (different fields) → render → `GET .../proof-status`.
- **Harness scenario:** `builder`.

### D. Mixed-system flow

- **Agreement writes** (quick_send or builder workers).
- **Affiliate / economics:** extend harness or run **parallel** `curl`/script against safe **GET** ops (e.g. `/v1/affiliates/ops/payout-batches` with operator auth if your staging policy allows) — avoid production payout **mutations** in load tests.
- **Onramp:** do **not** drive fake webhooks at high rate without idempotent fixtures; prefer **staging** Coinbase/Ramp sandboxes or a **small** fixed set of reconciliation calls.
- **Operator:** `operator` scenario → `GET /admin/deploy-readiness` with `CLAW_ADMIN_SECRET`.
- **Harness scenario:** `mixed` (read + write + operator sampling).

### E. Burst / campaign (CSN / Doginal-style spike)

- **Pattern:** **many concurrent sessions** (mostly read), **fewer concurrent writers** (agreement creates).
- **Harness scenario:** `campaign` — readers vs writers controlled by `CLAW_LOAD_CAMPAIGN_READ_RATIO` (default `0.92`).
- **Also:** run **read** scenario at high `workers`/`requests` while a **separate terminal** runs **quick_send** at low concurrency to approximate “spike + core usage.”

---

## 3. Metrics and pass/fail thresholds

### Capture (every run)

- **Latency:** p50 / p95 / p99 per **label** (harness prints per HTTP step: e.g. `read:/v1/healthz`, `agreement:draft`).
- **Error rate:** non-2xx/3xx (harness treats &lt;400 as success) per label and overall.
- **Throughput:** scenario invocations per wall second (printed).
- **External (required for launch sign-off):**
  - DB: active connections, max connections, slow queries (provider metrics).
  - `503` rate on `GET /v1/readyz` (if Postgres anchoring/timeline readiness is wired).
  - App logs: connection errors, `OperationalError`, timeouts.

### Two tiers (harness defaults)

Use **survival** to answer “did we break?” and **good UX** to answer “would this feel acceptable on launch day?” — without publishing vanity latency SLOs.

| Tier | Intent | Default knobs | Exit if fail |
|------|--------|----------------|--------------|
| **Survival** | No collapse: errors still bounded, dependencies mostly respond | `CLAW_LOAD_SURVIVAL_MAX_ERROR_RATE` (5%), loose p95 buckets for `read:` / `agreement:` / `operator:` | **2** |
| **Good UX** | Create / update / render / get feel reasonable; proof and operator reads stay usable | `CLAW_LOAD_UX_*` (+ legacy `CLAW_LOAD_P95_MS_*` / `CLAW_LOAD_MAX_ERROR_RATE`); separate ceilings for healthz/version vs `readyz` vs render vs proof | **1** (only if survival passed) |

**Exit 0** = both tiers pass. **`--no-thresholds`** always exits 0 after printing stats.

### Good-UX starting points (staging — tune, don’t worship)

These are **conversation anchors**, not marketing guarantees. Adjust for region, instance size, and API count.

| Route group | Metric | Initial good-UX gate (harness default) |
|-------------|--------|----------------------------------------|
| Liveness / static read | p95 `read:/v1/healthz`, `read:/v1/version` | **1 s** same region (lenient vs sub-100 ms vanity) |
| Readiness | p95 `read:/v1/readyz` | **2.5 s** (DB ping; document if you expect higher under load) |
| Other reads | p95 e.g. public verify | **2.5 s** fallback `read:*` |
| Agreement mutate | p95 `agreement:parse`, `draft`, `update-field` | **12 s** moderate concurrency |
| Render | p95 `agreement:render` | **18 s** (CPU/HTML bound unless async) |
| Proof read | p95 `agreement:proof-status` | **8 s** |
| Agreement GET | p95 `agreement:get` | **5 s** |
| Operator | p95 `operator:deploy-readiness` | **15 s** (`CLAW_DEPLOY_SMOKE_PROFILE=read_only` on prod-like staging) |
| Errors | Per-label rate (writes especially) | **2%** good UX · **5%** survival ceiling |

Full env list: `scripts/loadtest/README.md`.

**Fail the launch readiness discussion if:** survival tier fails (exit **2**), or good UX fails while DB metrics show saturation, `readyz` errors spike with connection pressure, or agreement paths show **p99 explosion** with small concurrency steps. Error rate spikes with **flat** CPU → suspect locks / pool exhaustion.

---

## 4. Implementation / tooling

- **Primary:** `python3 scripts/loadtest/run_flow_loadtest.py` (requires `requests`).
- **Optional extras (no repo dependency):** `hey`, `wrk`, or provider load tools for **static** URLs only; keep **authenticated** flows in the Python harness.
- **Fixtures:** stable staging org ids, one **public** agreement id for verify, admin secret in a secrets manager — never commit.
- **Environments:** run against **staging** that mirrors prod topology (managed Postgres, same pool limits). Local laptop numbers are for **regression only**, not capacity proof.

---

## 5. Files to add / change

| Path | Role |
|------|------|
| `docs/ops/PRE_LAUNCH_LOAD_TEST_PLAN.md` | This plan |
| `scripts/loadtest/README.md` | Runbook + env vars |
| `scripts/loadtest/harness.py` | Percentiles + survival / good-UX threshold helper (longest-prefix p95 match) |
| `scripts/loadtest/run_flow_loadtest.py` | Flow scenarios + CLI |
| `docs/ops/DEPLOY_SMOKE_TEST.md` | Cross-link to this plan |

---

## 6. Follow-up notes

- Extend harness with **economics GET** routes once staging auth headers are standardized (avoid hard-coding operator keys).
- Add **optional** Stripe/Coinbase **sandbox** webhook replay at **low** QPS in a separate script (idempotent keys).
- Correlate runs with **Postgres** `pg_stat_statements` or vendor APM — the harness does not replace DB-side analysis.
- Re-run after changing **connection limits**, **PgBouncer**, or **worker count**; thresholds are not universal constants.
