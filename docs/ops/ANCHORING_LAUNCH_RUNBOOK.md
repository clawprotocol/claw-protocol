# Anchoring — launch runbook (LawDog)

Operator guide for **Bitcoin canonical** + **Dogecoin mirror on a defined cadence**, **DB-backed anchor jobs**, and **scheduled** worker runs. Lean launch shape: [ANCHORING_AWS_LAUNCH.md](ANCHORING_AWS_LAUNCH.md). Protocol: `docs/protocol/BITCOIN_EPOCH_ANCHORING.md`, `docs/ANCHORING_MODEL.md`. Env: `docs/architecture/ENV_TOPOLOGY.md`.

---

## What gets anchored

- **Only** deterministic batch / Merkle **roots** (or commitments derived from those roots) — on-chain via local Core RPC, third-party HTTP API, **public Bitcoin broadcast**, or **Blockchair Dogecoin** (signed raw tx hex).
- **Never** agreement text, user uploads, or full receipt lists on-chain.

---

## Canonical vs mirror

| Role | Chain | Source of truth? |
|------|--------|------------------|
| **Canonical** | Bitcoin | **Yes** — verification and product truth. |
| **Mirror** | Dogecoin | **No** — same commitment when a mirror job exists; enqueued every **Nth** batch close (default **2**); secondary in proof semantics. |

---

## Eligibility (receipt batches)

1. Receipts close into a batch; Merkle root is fixed.
2. Batch row → **`ready_to_anchor`** (legacy `closed` is migrated on store init).
3. **`anchor_jobs`**: always **`chain=btc`**. **`chain=doge`** is inserted when the batch-close sequence matches **`CLAW_ANCHOR_DOGE_MIRROR_EVERY_NTH_BATCH`** (default **2**). Same `target_root_sha256`, `status=queued`.

**Worker drain:** With **`CLAW_ANCHORING_ENABLED=1`**, `python -m backend.workers.run_anchor_worker` runs `drain_receipt_batch_anchor_jobs`: submits **Bitcoin first**, then Dogecoin **only after** Bitcoin is no longer `queued` (if Bitcoin failed, fix and re-queue Bitcoin before Doge runs).

---

## Aggregate phase (ops)

Use `backend.anchoring.dual_chain_status.dual_chain_aggregate_from_jobs` or inspect both job rows:

| Situation | Typical phase label |
|-----------|---------------------|
| Nothing submitted | `queued` |
| Bitcoin only submitted | `bitcoin_submitted_dogecoin_queued` |
| Both submitted, unconfirmed | `both_submitted_unconfirmed` |
| Bitcoin confirmed, Doge still queued (not submitted) | `bitcoin_confirmed_dogecoin_queued` |
| Bitcoin confirmed, Doge submitted but unconfirmed | `bitcoin_confirmed_dogecoin_pending` |
| Both confirmed | `fully_anchored` (batch row moves to **`fully_anchored`** when promotion rules are met) |
| Bitcoin confirmed, **no** Dogecoin job for root | `bitcoin_confirmed_mirror_not_enqueued` |
| Bitcoin submitted, no Dogecoin job | `bitcoin_submitted_mirror_not_enqueued` |
| Bitcoin failed | `canonical_failed_retryable` |
| Bitcoin submitted (unconfirmed), Doge failed | `mirror_failed_retryable` |
| **Bitcoin confirmed**, Doge failed / terminal | `bitcoin_confirmed_mirror_failed_retryable` |

Per-job: `anchor_jobs.status` = `queued` → `submitted_unconfirmed` → `confirmed`, or `failed_retryable` with `failure_kind`.

---

## Cadence at launch

- **`CLAW_ANCHOR_CADENCE_DAYS=14`** (default) — align **EventBridge / cron** to the **canonical Bitcoin** target window (adjust as policy dictates).
- **`CLAW_ANCHOR_DOGE_MIRROR_EVERY_NTH_BATCH=2`** (default) — Dogecoin mirror job every **second** batch close (~28-day mirror period vs 14-day BTC when closes align).
- **Daily / weekly later:** change scheduler + env — no refactor.
- **`CLAW_RECEIPT_BATCH_ANCHOR_MAX_PER_RUN`** — cap receipt-batch submissions per worker invocation (default 20).
- **`CLAW_RECEIPT_BATCH_ANCHOR_CONFIRM_MAX_PER_RUN`** — cap automatic **confirmation** promotions per worker invocation (default **50**; set to **0** to disable auto-confirm for that cycle).
- **`CLAW_ANCHOR_CONFIRMATIONS_BTC`** / **`CLAW_ANCHOR_CONFIRMATIONS_DOGE`** — confirmations required before each chain’s batch job is promoted to `confirmed` (defaults: BTC **3** mainnet / **2** testnet; DOGE **6** mainnet / **5** testnet). Legacy **`CLAW_ANCHOR_BTC_CONFIRMATIONS`** / **`CLAW_ANCHOR_DOGE_CONFIRMATIONS`** apply only when the new names are unset.

---

## Self-hosted Core nodes (optional / legacy)

When **`CLAW_ANCHOR_*_PROVIDER`** is `local_rpc_*`, Bitcoin and Dogecoin Core in **pruned** mode are supported: fund wallet, broadcast, check recent tx/mempool. **No** archival or `txindex` assumption for launch paths.

---

## Execution providers

- **`CLAW_ANCHOR_BITCOIN_PROVIDER`**: `public_broadcast_bitcoin` (lean launch default when `CLAW_ANCHOR_ENV` is `staging`/`production` and unset), `local_rpc_bitcoin`, or `third_party_anchor`.
- **`CLAW_ANCHOR_DOGECOIN_PROVIDER`**: `blockchair_dogecoin` (lean default for `staging`/`production` when unset), `local_rpc_dogecoin`, or `third_party_anchor`.
- **Public Bitcoin:** `CLAW_ANCHOR_BTC_PUBLIC_BROADCAST_BASE_URL` optional; else mempool.space API host is inferred from `CLAW_ANCHOR_CANONICAL_BITCOIN_NETWORK`.
- **Blockchair Dogecoin:** `CLAW_ANCHOR_BLOCKCHAIR_BASE_URL`, optional `CLAW_ANCHOR_BLOCKCHAIR_API_KEY`, optional `CLAW_ANCHOR_BLOCKCHAIR_DOGE_CHAIN_PATH` (defaults include `dogecoin/testnet` when network label contains `test`).
- **Signed raw txs:** `CLAW_ANCHOR_SIGNED_RAW_TX_DIR` — files `<anchor_job_id>.hex` or `<commitment_sha256>.hex`.
- Third-party: `CLAW_THIRD_PARTY_ANCHOR_BASE_URL` + `CLAW_THIRD_PARTY_ANCHOR_API_KEY` (see `backend/anchoring/execution/providers.py`).
- **`GET /version`** → `anchor.launch_policy` including execution provider labels and `dogecoin_mirror_every_nth_batch_close`.

---

## Dogecoin mirror

- Mirror jobs are created on every **Nth** batch close (`CLAW_ANCHOR_DOGE_MIRROR_EVERY_NTH_BATCH`, default **2**).
- With **`blockchair_dogecoin`**, no `DOGECOIN_RPC_*` on the worker.
- **`CLAW_ANCHOR_MIRROR_DOGECOIN_NETWORK`** — network label (default `dogecoin-testnet`).

---

## Explorer links

- `CLAW_ANCHOR_BTC_EXPLORER_TX_URL` / `CLAW_ANCHOR_DOGE_EXPLORER_TX_URL` — `{txid}` placeholder.

---

## Partial failure & retry

1. **Bitcoin succeeds, Dogecoin fails:** fix mirror path (Blockchair/API errors, fee UTXOs for signed mirror txs, etc.); re-queue the **doge** job with **`POST /v1/ops/anchor/retry-job`** (JSON `{"job_id":"aj_..."}` or `{"receipt_batch_id":"rbatch_…","chain":"doge"}`) using **`x-claw-admin-secret`**, or **`POST /admin/anchor/receipt-batch/requeue`** when **`CLAW_ADMIN_ANCHOR_RUN_ENABLED=1`**. Prior failures are appended to **`failure_history_json`** on retry. **Do not** change the Merkle root.
2. **Bitcoin fails:** fix BTC; re-queue the **btc** job the same way. Doge stays `queued` until Bitcoin is no longer blocking the mirror drain.
3. **Confirmation:** the worker runs a lightweight poll after each drain: wallet `gettransaction` for local RPC, or HTTP status for `third_party_anchor`, `public_broadcast_bitcoin`, and `blockchair_dogecoin`. When thresholds are met, jobs move to `confirmed` automatically. The batch becomes **`fully_anchored`** when Bitcoin is confirmed and either there is **no** Dogecoin job for that root or the Dogecoin job is also **`confirmed`**. You can still call `AnchoringStore.mark_anchor_job_confirmed(job_id)` manually if needed.

Legacy SQL (equivalent to the requeue endpoint for `failed_retryable` batch jobs):

```sql
UPDATE anchor_jobs
SET status='queued', txid=NULL, broadcast_at=NULL, confirmed_at=NULL,
    last_error=NULL, failure_kind=NULL, updated_at=datetime('now')
WHERE id='aj_...' AND anchor_type='batch' AND status='failed_retryable';
```

---

## Observability & operator alerts

Anchoring emits **metadata-only** rows into the same operator alert feed as payouts (`lawdog_operator_alerts` via `emit_operator_alert`). Event types include RPC reachability (skipped when using HTTP broadcast providers), submission failures, Core wallet runway when applicable, stale unconfirmed jobs, receipt-batch backlog, cadence window drift, weekly worker cycle summaries, and `batch_fully_anchored`.

- **`CLAW_ANCHOR_OBSERVABILITY_ALERTS`** — default `1`; set to `0` to disable emission from the observability pass (submission-failure alerts from the drainer also respect this).
- **`CLAW_ANCHOR_ALERT_SLACK_WEBHOOK_URL`** — optional Slack incoming webhook (minimal JSON `text` payload). SMS/other channels: fan out from Slack or log shipping; not built in.
- **`CLAW_ANCHOR_RUN_KIND`** — label for scheduled/worker runs (default `scheduled_worker`); `POST /admin/anchor/run` forces `admin_http` for observability.
- **`CLAW_ANCHOR_WEEKLY_INFO_ALERT_MODE`** — `scheduled_only` (default): suppress **`weekly_anchor_cycle_completed`** on admin HTTP runs; `always` / `never` override.
- **`CLAW_ANCHOR_WEEKLY_INFO_ALERT_MIN_INTERVAL_SECONDS`** — optional dedupe window (e.g. `86400`) so info alerts are not repeated inside N seconds even when allowed by mode.

Each anchor cycle JSON includes **`anchor_run_kind`**, **`anchoring_observability.anchor_run_kind`**, **`anchoring_observability.operator_summary`** (compact BTC/DOGE runway, receipt-batch queue, last fully anchored batch), and **`anchoring_observability.weekly_anchor_cycle_info_alert`** (`emitted` vs suppression reason).

**Deploy readiness** (`GET /admin/deploy-readiness`) includes **`anchoring_operator_summary`** (compact), plus **`anchor_wallet_runway`** and **`anchoring_receipt_batch_queue`** when applicable.

---

## User-facing language (keep simple)

- **Recorded** — receipt exists.  
- **Included in batch** — batch `ready_to_anchor`.  
- **Anchored to Bitcoin** — canonical chain.  
- **Mirrored to Dogecoin** — mirror chain (secondary for verification).  
- **Fully anchored** — when UI receives `anchor_aggregate_phase=fully_anchored` (optional field).

Do **not** expose AWS, EventBridge, RPC hosts, or provider vendor names to end users. Do **not** imply legal finality.
