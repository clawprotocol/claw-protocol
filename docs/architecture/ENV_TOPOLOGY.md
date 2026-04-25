# CLAW environment topology

Maps **environment variables and runtime roles** to deployment components. **Authoritative definitions** live in Python (`backend/config/*.py`, `backend/main.py`, `backend/storage/*.py`, `backend/handlers/anchor_adapter.py`, etc.). This document is an operator-friendly index—not a second copy of every default.

Companion: **[Operator runbook](../ops/OPERATOR_RUNBOOK.md)**.

---

## Process ownership overview

| Variable / concern | API | Worker | Frontend build | Notes |
|-------------------|-----|--------|----------------|--------|
| HTTP server | ✓ | — | — | `uvicorn backend.main:app` |
| `run_anchor_batch_cycle` | optional `POST /admin/anchor/run` | ✓ CLI | — | Same code path; worker is primary in prod |
| SQLite DB paths | ✓ reads/writes | ✓ reads/writes | — | Must match between API and worker |
| `BITCOIN_RPC_*` / `DOGECOIN_RPC_*` | indirect (some paths) | ✓ anchoring when `local_rpc_*` providers | — | Not required for `public_broadcast_bitcoin` / `blockchair_dogecoin` |
| `CLAW_BLOB_ROOT` / storage backend | ✓ | ✓ if worker writes blobs | — | Shared in multi-instance setups |
| Vite `VITE_*` | — | — | ✓ build-time | Baked into static assets |

---

## Shared / core (typically both API and worker)

**Recommended production/staging Postgres posture:** set **only** `CLAW_DATABASE_URL` or `DATABASE_URL` for all Postgres-backed stores; leave store-specific `*_DATABASE_URL` variables **unset** unless you intentionally split databases. Rationale, examples, and misconfiguration traps: **[Launch database profile](../ops/LAUNCH_DATABASE_PROFILE.md)**.

| Variable | Purpose | Defined / used in |
|---------|---------|-------------------|
| `CLAW_ENVIRONMENT` | Label (`local`, `dev`, `test`, …); affects CORS defaults when unset | `backend/main.py` |
| `CLAW_DATA_DIR` | Base directory for data; defaults `~/.claw` or `/var/lib/claw` when writable | `runtime_environment.data_dir`, `agreements_v2_api`, stores |
| `CLAW_DATABASE_URL` / `DATABASE_URL` | **Primary** Postgres DSN (`postgresql://…`) — resolves to Postgres for anchoring, agreements, timeline, ledger, alerts, metering, onramp when per-store URLs are unset (see `backend/db/config.py`) | `backend/db/config.py`, store clients |
| `CLAW_ANCHORING_DATABASE_URL` | Optional DSN used **only** for anchoring (overrides `CLAW_DATABASE_URL` for that store) | `backend/db/config.py` |
| `CLAW_AGREEMENT_DATABASE_URL` | Optional DSN used **only** for agreement drafts + version store + signing locks (else `CLAW_DATABASE_URL` / `DATABASE_URL`) | `backend/db/config.py`, `agreement_draft_store`, `agreement_version_store`, `agreement_signing_lock_store` |
| `CLAW_AFFILIATE_LEDGER_DATABASE_URL` | Optional DSN for **affiliate earnings + payout ledger** only (else `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → ledger tables on economics SQLite) | `backend/db/config.py`, `economics/store.py`, `affiliate_ledger_postgres.py` |
| `CLAW_OPERATOR_ALERTS_DATABASE_URL` | Optional DSN for **operator alerts** only (else `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → `lawdog_operator_alerts` on economics SQLite) | `backend/db/config.py`, `economics/store.py`, `operator_alerts_postgres.py` |
| `CLAW_TIMELINE_DATABASE_URL` | Optional DSN for **timeline + receipts + Merkle batches** (else `CLAW_ANCHORING_DATABASE_URL`, then `CLAW_DATABASE_URL` / `DATABASE_URL`) | `backend/db/config.py`, `timeline_store.py`, `timeline_postgres.py` |
| `CLAW_USAGE_ECONOMICS_DATABASE_URL` | Optional DSN for **usage economics / metering** only (else `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → `usage_economics.sqlite3` under `CLAW_DATA_DIR`) | `backend/db/config.py`, `usage_economics/store.py`, `usage_economics_postgres.py` |
| `CLAW_ONRAMP_PAYMENTS_DATABASE_URL` | Optional DSN for **crypto onramp payments** (`OnrampStore`) only (else `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → `onramp_payments.sqlite3`) | `backend/db/config.py`, `payments/store.py`, `onramp_payments_postgres.py` |
| `CLAW_PG_SCHEMA_ANCHORING` | Postgres schema for anchoring tables (default `lawdog_anchoring`) | `backend/db/config.py` |
| `CLAW_PG_SCHEMA_AGREEMENTS` | Postgres schema for agreement tables (default `lawdog_agreements`) | `backend/db/config.py` |
| `CLAW_PG_SCHEMA_AFFILIATE_LEDGER` | Postgres schema for affiliate ledger (default `lawdog_affiliate_ledger`) | `backend/db/config.py`, `affiliate_ledger_postgres.py` |
| `CLAW_PG_SCHEMA_OPERATOR_ALERTS` | Postgres schema for operator alerts (default `lawdog_operator_alerts`) | `backend/db/config.py`, `operator_alerts_postgres.py` |
| `CLAW_PG_SCHEMA_TIMELINE` | Postgres schema for timeline domain (default `lawdog_timeline`) | `backend/db/config.py`, `timeline_postgres.py` |
| `CLAW_PG_SCHEMA_USAGE_ECONOMICS` | Postgres schema for usage economics (default `lawdog_usage_economics`) | `backend/db/config.py`, `usage_economics_postgres.py` |
| `CLAW_PG_SCHEMA_ONRAMP_PAYMENTS` | Postgres schema for onramp payments (default `lawdog_onramp_payments`) | `backend/db/config.py`, `onramp_payments_postgres.py` |
| `CLAW_PG_CONNECT_TIMEOUT_SEC` | Postgres client TCP connect timeout for anchoring (default **10** sec, clamped **2–120**) | `backend/db/config.py`, `anchoring_sql.py`, `readiness.py` |
| `CLAW_PG_STATEMENT_TIMEOUT_MS` | Optional session `statement_timeout` (ms) for anchoring connections | `backend/db/config.py`, `anchoring_sql.py` |
| `CLAW_DEBUG` | Verbose / dev-ish behavior | `backend/main.py` |
| `CLAW_PROCESS_ROLE` | e.g. `api` vs `worker` (documented for ops; worker CLI reads it) | `runtime_environment.process_role` |
| `CLAW_NODE_MODE` | `api` vs `verifier` — verifier-style nodes block writes | `backend/main.py`, `agreements_v2_api` |
| `CLAW_VERIFIER_ONLY` | Additional write restrictions on some paths | `backend/main.py` |
| `CLAW_PROTOCOL_VERSION` / `CLAW_API_VERSION` | Protocol labeling | `backend/main.py`, services |
| `CLAW_TIMELINE_DB_PATH` | Timeline + receipts + Merkle batches SQLite path (ignored for persistence when a **Postgres timeline DSN** is active) | `runtime_environment.timeline_db_path`, `TimelineStore` |
| `CLAW_USAGE_DB_PATH` | Usage metering + **anchor queue** SQLite default | `backend/utils/usage_store.py`, `anchor_queue.py` |
| `CLAW_USAGE_ECONOMICS_DB_PATH` | Override path for **LawDog usage economics** SQLite (`usage_economics.sqlite3` default under `CLAW_DATA_DIR`; ignored when a Postgres usage-economics DSN is set) | `backend/usage_economics/store.py` |
| `CLAW_ONRAMP_DB_PATH` | Override path for **crypto onramp payments** SQLite (`onramp_payments.sqlite3` default under `CLAW_DATA_DIR`; ignored when a Postgres onramp-payments DSN is set) | `backend/payments/store.py` |
| `CLAW_ANCHOR_MODE` | `batch` vs `immediate` — worker batch cycle requires `batch` | `runtime_environment.anchor_mode`, `anchor_runner.py` |
| `CLAW_ANCHOR_ENABLE_MAINNET` | `1` to allow mainnet broadcasts | `runtime_environment.mainnet_disabled`, `anchor_runner.py` |
| `CLAW_ANCHOR_DEFAULT_NETWORK` | Default label in `/version` | `backend/main.py` |
| `CLAW_ANCHOR_CADENCE_DAYS` | Launch **target** days between canonical Bitcoin anchor windows (default **14**); set to **1** for daily without code changes | `backend/anchoring/config.py`, runbook |
| `CLAW_ANCHOR_DOGE_MIRROR_EVERY_NTH_BATCH` | Insert Dogecoin mirror `anchor_jobs` every **Nth** receipt-batch close (default **2** = every second close) | `backend/anchoring/batch_service.py` |
| `CLAW_ANCHOR_ENV` | `local` (default) vs `staging` / `production` — affects default execution providers when `CLAW_ANCHOR_*_PROVIDER` unset | `backend/anchoring/config.py` |
| `CLAW_ANCHORING_ENABLED` | `1` enables draining **receipt-batch** `anchor_jobs` in the worker (`anchoring.sqlite3`) | `backend/anchoring/anchor_drainer.py` |
| `CLAW_RECEIPT_BATCH_ANCHOR_MAX_PER_RUN` | Max receipt-batch anchor submissions per worker invocation (default **20**) | `backend/services/anchor_runner.py` |
| `CLAW_RECEIPT_BATCH_ANCHOR_CONFIRM_MAX_PER_RUN` | Max receipt-batch jobs auto-promoted to `confirmed` per worker cycle (default **50**; **0** disables) | `backend/anchoring/confirmation_poll.py` |
| `CLAW_ANCHOR_CONFIRMATIONS_BTC` | Confirmations before canonical Bitcoin batch job → `confirmed` (default **3** mainnet / **2** testnet); overrides legacy `CLAW_ANCHOR_BTC_CONFIRMATIONS` if both set | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_CONFIRMATIONS_DOGE` | Dogecoin mirror confirmations (default **6** mainnet / **5** testnet); overrides legacy `CLAW_ANCHOR_DOGE_CONFIRMATIONS` if both set | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_BTC_CONFIRMATIONS` | Legacy alias (used only if `CLAW_ANCHOR_CONFIRMATIONS_BTC` unset) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_DOGE_CONFIRMATIONS` | Legacy alias (used only if `CLAW_ANCHOR_CONFIRMATIONS_DOGE` unset) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_OBSERVABILITY_ALERTS` | `1` (default) emits anchoring operator alerts + Slack mirror; `0` disables observability pass / drainer alert hooks | `backend/anchoring/anchor_alert_dispatch.py`, `observability_cycle.py` |
| `CLAW_ANCHOR_ALERT_SLACK_WEBHOOK_URL` | Optional Slack incoming webhook for anchoring alerts | `backend/anchoring/anchor_alert_dispatch.py` |
| `CLAW_ANCHOR_RECEIPT_BATCH_BACKLOG_CRITICAL` | Queued receipt-batch `anchor_jobs` count threshold for critical alert (default **50**) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_STALE_SUBMITTED_JOB_HOURS` | Unconfirmed batch jobs older than this (by `broadcast_at`) trigger a warning (default **48**) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_BATCH_WINDOW_GRACE_DAYS` | Grace beyond `CLAW_ANCHOR_CADENCE_DAYS` before warning on stuck `ready_to_anchor` batches (default **2**) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_BTC_FALLBACK_FEE_BTC` / `CLAW_ANCHOR_DOGE_FALLBACK_FEE_DOGE` | Wallet runway fallback when recent sends are missing | `backend/anchoring/wallet_runway.py` |
| `CLAW_ANCHOR_EST_WEEKLY_TX_COUNT_BTC` / `CLAW_ANCHOR_EST_WEEKLY_TX_COUNT_DOGE` | Estimated anchor txs per week per chain for runway (default **1**) | `backend/anchoring/wallet_runway.py` |
| `CLAW_ANCHOR_RUN_KIND` | Worker/cron label for observability (default **`scheduled_worker`**); admin HTTP uses **`admin_http`** | `anchor_worker_service.py`, `main.py` |
| `CLAW_ANCHOR_WEEKLY_INFO_ALERT_MODE` | `scheduled_only` (default) \| `always` \| `never` — controls **`weekly_anchor_cycle_completed`** noise | `backend/anchoring/observability_cycle.py` |
| `CLAW_ANCHOR_WEEKLY_INFO_ALERT_MIN_INTERVAL_SECONDS` | Min seconds between weekly info alerts when > **0** | `backend/anchoring/observability_cycle.py` |
| `CLAW_ANCHOR_CANONICAL_BITCOIN_NETWORK` | e.g. `bitcoin-mainnet` / `bitcoin-testnet` — stored on `anchor_jobs.network` for canonical jobs | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_MIRROR_DOGECOIN_NETWORK` | e.g. `dogecoin-mainnet` / `dogecoin-testnet` | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_BITCOIN_PROVIDER` | `public_broadcast_bitcoin` (default when `CLAW_ANCHOR_ENV` is `staging`/`production` and unset), `local_rpc_bitcoin` (default for `local`), or `third_party_anchor` | `backend/anchoring/execution/facade.py` |
| `CLAW_ANCHOR_DOGECOIN_PROVIDER` | `blockchair_dogecoin` (staging/prod default when unset), `local_rpc_dogecoin` (local default), or `third_party_anchor` | `backend/anchoring/execution/facade.py` |
| `CLAW_ANCHOR_BTC_PUBLIC_BROADCAST_BASE_URL` | Optional Esplora API root (e.g. mempool.space `.../api`); else inferred from canonical Bitcoin network | `backend/anchoring/config.py`, `http_anchor_providers.py` |
| `CLAW_ANCHOR_BLOCKCHAIR_BASE_URL` | Blockchair API root (default `https://api.blockchair.com`) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_BLOCKCHAIR_API_KEY` | Optional Blockchair API key (query param) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_BLOCKCHAIR_DOGE_CHAIN_PATH` | Override path segment (e.g. `dogecoin/testnet`) | `backend/anchoring/config.py` |
| `CLAW_ANCHOR_SIGNED_RAW_TX_DIR` | Directory of `<job_id>.hex` / `<commitment>.hex` for HTTP broadcast providers | `raw_tx_staging.py` |
| `CLAW_THIRD_PARTY_ANCHOR_BASE_URL` | HTTPS API root for third-party anchor (optional) | `ThirdPartyAnchorExecutionProvider` |
| `CLAW_THIRD_PARTY_ANCHOR_API_KEY` | Bearer token for third-party API (optional) | `ThirdPartyAnchorExecutionProvider` |
| `CLAW_ANCHOR_BTC_EXPLORER_TX_URL` / `CLAW_ANCHOR_DOGE_EXPLORER_TX_URL` | `{txid}` template for ops links | `backend/anchoring/config.py` |
| `CLAW_MERKLE_ANCHOR_MAX_ATTEMPTS` | Merkle batch anchor retries | `runtime_environment`, `timeline_store` |
| `CLAW_TIMELINE_ANCHOR_MAX_ATTEMPTS` | Timeline OP_RETURN job retries | `runtime_environment`, `anchor_runner` |
| `CLAW_MERKLE_ANCHOR_MAX_BATCHES_PER_RUN` | Cap Merkle anchors per worker cycle | `anchor_runner.py` |
| `CLAW_TIMELINE_ANCHOR_MAX_PER_BATCH` | Claim cap for timeline jobs | `anchor_runner.py` |
| `CLAW_ANCHOR_MAX_PER_BATCH` | Proof queue claim cap | `anchor_runner.py` |
| `CLAW_FEED_DB_PATH` | Feed store SQLite override | `claw_feed_store.py` (via env) |
| `CLAW_TREASURY_DB_PATH` | Treasury / CLAW Key ledger SQLite | `treasury_store.py` |
| `CLAW_ARTIFACT_REGISTRY_DB_PATH` | Artifact metadata SQLite | `storage_runtime.artifact_registry_db_path` |
| `CLAW_STORAGE_BACKEND` | `local` vs `s3`/`object`/`r2` (stub raises until implemented) | `blob_store.py`, `artifact_repository.py` |
| `CLAW_BLOB_ROOT` | Local blob directory | `blob_store.get_blob_store` |
| `CLAW_UNIFIED_ARTIFACT_STORE` | VS01 doc/receipt unified path | `storage_runtime.py` |
| `CLAW_VS01_LEGACY_FILE_MIRROR` | Mirror VS01 files under legacy dirs | `document_service`, `receipt_service`, `storage_runtime` |
| `CLAW_CACHE_VERIFICATION_BUNDLES` | Cache VS01 verification ZIPs | `storage_runtime`, `vs01_receipts_api` |
| `CLAW_DOCUMENTS_DIR` / `CLAW_RECEIPTS_DIR` / `CLAW_SIGN_SESSIONS_DIR` | Legacy layout paths | respective services |

---

## API-only (or “primarily API”)

| Variable | Purpose |
|---------|---------|
| HTTP `GET /v1/readyz` | Readiness (503 when **any configured** launch Postgres domain fails `SELECT 1`); usage-economics metering PG excluded; liveness remains `GET /v1/healthz` | `backend/main.py`, `backend/db/readiness.py` |
| `CLAW_CORS_ALLOW_ORIGINS` | Comma-separated origins; empty + non-dev env tightens CORS |
| `CLAW_RATE_LIMIT_RPS` / `CLAW_RATE_LIMIT_BURST` | HTTP rate limits (`0` disables) |
| `CLAW_MAX_REQUEST_BYTES_VERIFY` | Large verify route limit |
| `CLAW_ENABLE_MULTIPART` | File upload routes enabled when `1` |
| `CLAW_X402_PAYMENT_HEADER` | Payment proof header name (default `X-PAYMENT`) |
| `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` | HMAC for signed recipient/signer links |
| `CLAW_RECIPIENT_LINK_MINT_KEY` | Required for minting recipient tokens when set |
| `CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED` | Product policy: `t=` tokens |
| `CLAW_RECIPIENT_TOKEN_TTL_MIN_SECONDS` / `MAX_SECONDS` | Bounds for minted links |
| `CLAW_RECIPIENT_TOKEN_TTL_SECONDS` | Optional API override (see agreements router) |
| `CLAW_RECIPIENT_TOKEN_LOG_VALIDATIONS` | Logging toggle |
| `CLAW_ADMIN_SECRET` | If set, `x-claw-admin-secret` required for admin routes |
| `CLAW_ADMIN_ANCHOR_RUN_ENABLED` | `0` disables `POST /admin/anchor/run` and `POST /admin/anchor/receipt-batch/requeue` |
| `CLAW_PUBLIC_AGREEMENT_VERIFY` | Public verify behavior for agreements |
| `CLAW_BUNDLE_MAX_ZIP_BYTES` / related | Workflow bundle limits (`bundle_service.py`) |
| `OPENAI_API_KEY`, `CLAW_LLM_MODEL` (fallback when no explicit model; default `gpt-5.4-nano`), `CLAW_LLM_MODEL_BASIC` (default `gpt-5.4-nano`), `CLAW_LLM_MODEL_PREMIUM` (default `gpt-5.4-mini`). Enterprise/concierge assumption: `gpt-5.4` via env or dedicated deploy — not a separate client routing key. | LLM routes (`backend/llm_router.py`) |

Treasury ingestion and ledger recording may be triggered from API handlers; DB paths are still **shared core**.

---

## Worker-only (or “worker-first”)

| Variable | Purpose |
|---------|---------|
| `CLAW_WORKER_X402_PAYMENT_HEADER_VALUE` | Server-side payment proof for proof-queue jobs when needed |
| `CLAW_FEED_ANCHOR_MAX_PER_BATCH` | Feed anchor jobs claimed per cycle |
| `CLAW_FEED_ANCHOR_STALE_CLAIM_SECONDS` | Stale job recovery threshold |
| `CLAW_FEED_ANCHOR_MAX_ATTEMPTS` | Feed anchor retry cap |

**Chain RPC variables** are required on the **worker** only when using **`local_rpc_bitcoin`** / **`local_rpc_dogecoin`**:

- `BITCOIN_RPC_URL`, `BITCOIN_RPC_USER`, `BITCOIN_RPC_PASSWORD`, `BITCOIN_RPC_COOKIE`, `BITCOIN_RPC_WALLET`
- `DOGECOIN_RPC_URL`, `DOGECOIN_RPC_USER`, `DOGECOIN_RPC_PASSWORD`, `DOGECOIN_RPC_COOKIE`, `DOGECOIN_RPC_WALLET`

For **HTTP broadcast** defaults, signing and UTXO management happen **outside** the worker; see `docs/ops/ANCHORING_AWS_LAUNCH.md`. See `backend/handlers/anchor_adapter.py` for Core defaults (localhost—**override** when using RPC providers).

---

## Chain / network policy

Allowed agreement/feed anchor slugs (code): `bitcoin-mainnet`, `bitcoin-testnet`, `dogecoin-mainnet`, `dogecoin-testnet` — `ALLOWED_AGREEMENT_ANCHOR_NETWORKS` in `backend/config/anchor_network_config.py`.

| Variable | Role |
|---------|------|
| `CLAW_FEED_EVENT_ANCHOR_NETWORK` | Default network for **feed-event** anchoring (`feed_anchor_policy.py`; must stay in allowed set) |
| `CLAW_SETTLEMENT_ANCHOR_NETWORK_HINT` | **Hint** for stronger settlement / Merkle framing (display & policy) |
| `CLAW_AGREEMENT_RECEIPT_PROTOCOL_VERSION` | Receipt protocol version string |

**Mainnet guard:** `CLAW_ANCHOR_ENABLE_MAINNET` must be `1` for mainnet broadcasts in guarded paths.

---

## Storage-specific

| Variable | Role |
|---------|------|
| `CLAW_STORAGE_BACKEND` | `local` (default) or `s3`/`object`/`r2` (stub — fails honestly on I/O) |
| `CLAW_BLOB_ROOT` / `CLAW_DATA_DIR` | Local blob layout |
| `CLAW_ARTIFACT_REGISTRY_DB_PATH` | SQLite index for artifacts |
| `CLAW_UNIFIED_ARTIFACT_STORE`, `CLAW_CACHE_VERIFICATION_BUNDLES`, `CLAW_VS01_LEGACY_FILE_MIRROR` | VS01 + bundle behavior |

**Dev-only:** `CLAW_DEV_STORAGE_SMOKE=1` enables `GET /internal/dev/storage-smoke`.

---

## Feed / proof policy

| Variable | Role |
|---------|------|
| `CLAW_FEED_PUBLIC_API_ENABLED` | When off, `GET /api/feed/public` returns 404 |
| `CLAW_FEED_EVENT_ANCHOR_NETWORK` | Dogecoin-first default in code |
| `CLAW_SETTLEMENT_ANCHOR_NETWORK_HINT` | Bitcoin-oriented settlement hint |
| `CLAW_FEED_ANCHOR_MAX_ATTEMPTS` | Feed job retries |

Proof **status in product** is driven by timeline + batch rows (API exposes e.g. agreement proof-status routes); worker updates those rows when broadcasts succeed or fail.

---

## Treasury / payment / CLAW Key

| Variable | Role |
|---------|------|
| `CLAW_TREASURY_DB_PATH` | Treasury SQLite |
| `CLAW_TREASURY_OPS_BPS`, `CLAW_TREASURY_RESERVE_BPS`, `CLAW_TREASURY_POOL_BPS`, `CLAW_TREASURY_SPLIT_POLICY_VERSION` | Split policy (`treasury_policy.py`) |
| `CLAW_KEY_DEFAULT_EXTEND_DAYS` | Default extension when issuing/extending keys |
| `CLAW_RECORD_USAGE_LEDGER` | Gate for usage ledger hooks (`treasury_usage_hooks.py`) |
| `CLAW_RESOLVE_TIER_FROM_CLAW_KEY` | Tier resolution toggle (`enforce.py`) |

Payment adapter configuration is primarily **HTTP header** (`X-PAYMENT` / `CLAW_X402_PAYMENT_HEADER`) on API requests; worker uses `CLAW_WORKER_X402_PAYMENT_HEADER_VALUE` when draining paid anchor jobs.

---

## Frontend (build-time `VITE_*`)

These are **not** read by the Python API at runtime. Set in CI or `.env` for Vite:

| Variable | Role (typical) |
|---------|-----------------|
| `VITE_LAWDOG_PRIVACY_EMAIL` | **Required for production LawDog sites:** monitored privacy / data-rights inbox baked into `PrivacyPage` (`#privacy-contact`) and linked site-wide. Omit only for local/dev; production builds without it log a **console-only** deploy warning at SPA startup (`privacyInboxDeployGuard.ts`). |
| `VITE_API_BASE` | Browser → API origin (several modules; default localhost in dev) |
| `VITE_CLAW_API_BASE` | VS01 step—**required** in some builds (`vs01Api.ts`) |
| `VITE_CLAW_ANCHOR_NETWORK` | Client-side default for finalized-receipt registration |
| `VITE_RECIPIENT_LINK_MINT_KEY` | Optional dev convenience for minting from UI |
| `VITE_CLAW_ACCESS_TIER`, `VITE_CLAW_ACCESS_DEV_TOOLS` | Access / dev toggles |
| `VITE_CLAW_LEGACY_AGREEMENT`, `VITE_CLAW_VOICE_REALTIME` | Product flags |

Local dev: `scripts/dev.sh` sets `VITE_API_BASE` to match the backend port.

---

## Deploy smoke / readiness

| Variable | Role |
|---------|------|
| `CLAW_DEPLOY_SMOKE_PROFILE` | `read_only` \| `standard` \| `deep` — controls default artifact round-trip in `/admin/deploy-readiness` |
| `CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP` | `0`/`1` — override artifact put/get/delete probe |
| `CLAW_DEPLOY_SMOKE_AGREEMENT_WRITE` | When `1`, `scripts/deploy_smoke.py` runs `parse`+`draft` only (blocked in production unless force flag in doc) |
| `CLAW_DEPLOY_SMOKE_EXTENDED` | When `1`, also `update-field` + `POST /v1/timelines` + list events (same prod guard as agreement write) |
| `CLAW_DEPLOY_SMOKE_FAIL_ON_OPERATOR_SUMMARY` | When `1`, exit **1** if `checks.anchoring_operator_summary` is missing or `status: error` |
| `CLAW_DEPLOY_SMOKE_I_UNDERSTAND_PRODUCTION_WRITES` | Documented escape hatch for agreement write smoke in prod (avoid) |

See **`docs/ops/DEPLOY_SMOKE_TEST.md`**.

---

## How to verify configuration safely

- **`GET /version`** — public snapshot of anchor mode, mainnet flag, cadence defaults.
- **`GET /admin/runtime-summary`** — richer, **non-secret** operator snapshot via `public_runtime_summary()` (includes `artifact_storage` subset).
- **`GET /admin/deploy-readiness`** — DB / queue / RPC ping / optional artifact round-trip (admin auth).

Never paste RPC passwords or signing secrets into tickets or docs.
