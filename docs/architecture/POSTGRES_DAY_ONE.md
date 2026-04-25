# Postgres day-one (lean managed database)

> **Launch default:** one shared `CLAW_DATABASE_URL` (or `DATABASE_URL`); **omit** per-store Postgres URLs unless you intentionally split clusters. Step-by-step posture + examples: **[Launch database profile](../ops/LAUNCH_DATABASE_PROFILE.md)**.

LawDog is moving from **file SQLite** defaults to **optional managed Postgres** without a later “big bang” migration for new environments. **Anchoring** (`AnchoringStore`), **agreement transactional storage** (draft JSON, version rows, signing-lock snapshots), **affiliate earnings + payout ledger**, **operator alerts** (`lawdog_operator_alerts`), **timeline / receipts / Merkle batches** (`TimelineStore`), **usage economics / metering** (`UsageEconomicsStore`), and **crypto onramp payments** (`OnrampStore` — payments, receipts, reserves, canonical events, webhook idempotency) can use Postgres via DSN. Core economics SQLite (subscriptions, `affiliate_accruals`, `affiliate_attributions`, Stripe org maps, Stripe webhook dedupe, etc.) may remain file-backed while hot tables are split out.

## Connection

| Variable | Purpose | Single-DSN launch |
|----------|---------|-------------------|
| `CLAW_DATABASE_URL` or `DATABASE_URL` | Postgres DSN when scheme is `postgresql` / `postgres` | **Set this** (primary) |
| `CLAW_ANCHORING_DATABASE_URL` | Optional override: anchoring only on Postgres while other DBs stay SQLite | Usually **omit** |
| `CLAW_AGREEMENT_DATABASE_URL` | Optional override: agreement drafts + `agreement_versions` + signing locks on Postgres (else falls back to `CLAW_DATABASE_URL` / `DATABASE_URL`) | Usually **omit** |
| `CLAW_AFFILIATE_LEDGER_DATABASE_URL` | Optional override: affiliate ledger tables only (else falls back to `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → ledger stays on economics SQLite) | Usually **omit** |
| `CLAW_OPERATOR_ALERTS_DATABASE_URL` | Optional override: operator alert rows only (else `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → alerts stay on economics SQLite) | Usually **omit** |
| `CLAW_TIMELINE_DATABASE_URL` | Optional override: timeline + receipts + Merkle batch tables (else `CLAW_ANCHORING_DATABASE_URL`, then `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → `timeline.sqlite3`) | Usually **omit** |
| `CLAW_USAGE_ECONOMICS_DATABASE_URL` | Optional override: usage metering store only (else `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → `usage_economics.sqlite3`) | Usually **omit** |
| `CLAW_ONRAMP_PAYMENTS_DATABASE_URL` | Optional override: crypto onramp payments store only (else `CLAW_DATABASE_URL` / `DATABASE_URL`; unset → `onramp_payments.sqlite3`) | Usually **omit** |
| `CLAW_PG_SCHEMA_AGREEMENTS` | Postgres schema for agreement tables (default `lawdog_agreements`) |
| `CLAW_PG_SCHEMA_AFFILIATE_LEDGER` | Postgres schema for affiliate ledger (default `lawdog_affiliate_ledger`) |
| `CLAW_PG_SCHEMA_OPERATOR_ALERTS` | Postgres schema for operator alerts (default `lawdog_operator_alerts`) |
| `CLAW_PG_SCHEMA_TIMELINE` | Postgres schema for timeline domain (default `lawdog_timeline`) |
| `CLAW_PG_SCHEMA_USAGE_ECONOMICS` | Postgres schema for usage economics (default `lawdog_usage_economics`) |
| `CLAW_PG_SCHEMA_ONRAMP_PAYMENTS` | Postgres schema for onramp payments (default `lawdog_onramp_payments`) |
| `CLAW_PG_CONNECT_TIMEOUT_SEC` | TCP connect timeout for Postgres store clients (default **10**, clamped **2–120**) |
| `CLAW_PG_STATEMENT_TIMEOUT_MS` | Optional `statement_timeout` (ms) on Postgres sessions via libpq `options` |

Unset DSN → anchoring uses **`CLAW_ANCHORING_DB_PATH`** (file SQLite); agreements use **`data/agreements/*.json`** + **`agreements.sqlite3`** for versions, unchanged from before.

### Recommended single-DSN launch profile (production)

**Typical posture:** set **only** `CLAW_DATABASE_URL` (or `DATABASE_URL`) to one managed Postgres instance. **Leave unset** the domain-specific URLs (`CLAW_ANCHORING_DATABASE_URL`, `CLAW_AGREEMENT_DATABASE_URL`, `CLAW_AFFILIATE_LEDGER_DATABASE_URL`, `CLAW_OPERATOR_ALERTS_DATABASE_URL`, `CLAW_TIMELINE_DATABASE_URL`, `CLAW_USAGE_ECONOMICS_DATABASE_URL`, `CLAW_ONRAMP_PAYMENTS_DATABASE_URL`) unless you intentionally split workloads.

Copy-paste **staging / production** env sketches and **anti-patterns** (accidental split hosts): **[Launch database profile](../ops/LAUNCH_DATABASE_PROFILE.md)**.

- **Schema separation:** each store uses libpq `options=-c search_path=<schema>,public` (`CLAW_PG_SCHEMA_*`), so all domains can share **one database** without table-name collisions.
- **Still SQLite at launch (common):** **`economics.sqlite3`** (subscriptions, Stripe webhook dedupe, accruals when ledger is still local, etc.), **`treasury`**, **`CLAW_USAGE_DB_PATH`** anchor queue, **`CLAW_FEED_DB_PATH`**, and optional **`usage_economics.sqlite3`** when metering DSN is not set — see `GET /admin/deploy-readiness` for file pings.
- **Override DSNs** when you need a second cluster (e.g. isolate anchoring blast radius, read replica routing not built-in — use only if ops explicitly want split).

### Pooling and connection count (lean posture)

- The app does **not** ship an application-side pool: each store opens a connection, runs short work, and closes (same simplicity as SQLite file handles).
- **Sizing:** estimate peak concurrent Postgres sessions ≈ API concurrency × instances for **anchoring + agreement + affiliate ledger + operator alerts + timeline + usage economics + onramp payments** paths + anchor workers. Stay under the provider’s `max_connections` with headroom for admin/migrations.
- **PgBouncer (or provider proxy)** is optional: add it only if you hit connection limits or the vendor recommends it; prefer **transaction** pooling if you introduce a pooler (avoid long-lived prepared statements tied to one backend unless you use session mode).
- **Managed Postgres** (RDS, Cloud SQL, etc.) already multiplexes storage; lean launch is **direct DSN** from app to instance unless metrics show connection exhaustion.

## Schema layout

### Anchoring

- Tables in schema **`lawdog_anchoring`** (override with `CLAW_PG_SCHEMA_ANCHORING`).
- **Migrations:** `backend/anchoring/migrations/postgres/*.sql` applied in lexical order on `AnchoringStore.init_schema()`.
- SQLite fallback: `backend/anchoring/migrations/*.sql` via `executescript` plus legacy `PRAGMA`/ALTER backfills.

### Agreements (transactional)

- Tables in schema **`lawdog_agreements`** (override with `CLAW_PG_SCHEMA_AGREEMENTS`): `agreement_drafts` (one JSONB payload per id, `created_at` / `updated_at`), `agreement_versions` (same columns as legacy SQLite), `agreement_signing_locks` (JSONB payload per agreement id).
- **Migrations:** `backend/agreements/migrations/postgres/*.sql` applied on first agreement Postgres use (`ensure_agreement_postgres_schema`).
- **Semantics:** agreement **ids** and JSON shape are unchanged; canonical JSON is stored as for files (`canon_json_bytes`). Version rows are not FK-linked to drafts (matches prior file+SQLite looseness).

### Affiliate ledger (earnings + payouts)

- Tables in schema **`lawdog_affiliate_ledger`** (override with `CLAW_PG_SCHEMA_AFFILIATE_LEDGER`): `affiliate_earnings`, `affiliate_payout_methods`, `affiliate_payout_batches`, `affiliate_payout_batch_items`, `affiliate_payouts`.
- **Migrations:** `backend/economics/migrations/postgres/*.sql` applied on first ledger Postgres use (`ensure_affiliate_ledger_schema` from `EconomicsStore.init_schema`).
- **Money:** USD amounts use `NUMERIC(24,6)` in Postgres; application APIs still pass floats where they did before; store/ledger layers round consistently to micro-USD scale.
- **Split database:** promotion from `pending` → `payable` reads active Stripe subscription ids from economics SQLite and passes them into the Postgres update (same qualifying semantics as the monolithic SQLite query).
- **Concurrency:** draft batch creation, batch finalization (`exported` → `paid`), and integrity checks use short transactions; paid transition locks the payout batch row (`SELECT … FOR UPDATE`) before mutating earnings and related rows.

### Operator alerts

- Table **`lawdog_operator_alerts`** in schema **`lawdog_operator_alerts`** (override with `CLAW_PG_SCHEMA_OPERATOR_ALERTS`).
- **Migrations:** `backend/economics/migrations/operator_alerts_postgres/*.sql` applied on first use (`ensure_operator_alerts_schema` from `EconomicsStore.init_schema`).
- **Read path:** `list_operator_alerts` returns the same shape as SQLite (including parsed `payload` JSON); anchoring HTTP summary still groups by `event_type` in Python (`gather_anchoring_operator_http_summary`).

### Timeline (proof spine)

- **Activation:** `CLAW_TIMELINE_DATABASE_URL` (else `CLAW_ANCHORING_DATABASE_URL`, then `CLAW_DATABASE_URL` / `DATABASE_URL`). When any of these is a `postgresql` DSN, `TimelineStore` uses **`timeline_postgres`**; **`CLAW_TIMELINE_DB_PATH` is then ignored** for persistence (path is only used for SQLite fallback).
- Tables in schema **`lawdog_timeline`** (`CLAW_PG_SCHEMA_TIMELINE`): `timelines`, `events`, `receipts`, `batches`, `batch_receipts`, `timeline_anchor_jobs`.
- **Migrations:** `backend/utils/migrations/timeline_postgres/*.sql` on first use (`ensure_timeline_schema` from `TimelineStore._init_db`). SQLite continues to use inline DDL in `timeline_store._init_db` plus the same **index set** as Postgres for hot paths (events by timeline / event_id, receipts by timeline+issued_at, unbatched receipt partial index, batches by `created_at`).
- **Semantics:** `event_sha256` / `manifest_sha256` / receipt batching use the same Python (`canon_sha256_hex`, `build_receipt_batch`); JSON columns store the same canonical JSON strings as SQLite text columns. **Append / freeze:** Postgres uses `SELECT … FOR UPDATE` on the timeline row (and short transactions) where SQLite used `BEGIN IMMEDIATE`.
- **Receipt-batch anchor jobs** remain in `AnchoringStore` / usage-queue SQLite as today; only **timeline-local** Merkle batches and **timeline_anchor_jobs** live here.

### Usage economics (metering)

- Tables in schema **`lawdog_usage_economics`** (`CLAW_PG_SCHEMA_USAGE_ECONOMICS`): `agreement_owner`, `subject_counters`, `ip_subject_day`, `analytics_events`, `ip_draft_burst` (same logical model as SQLite under `usage_economics.sqlite3`).
- **Migrations:** `backend/usage_economics/migrations/postgres/*.sql` on first use (`ensure_usage_economics_schema` from `UsageEconomicsStore.init_schema`).
- **Semantics:** `UsageEconomicsStore` public methods unchanged; hot paths remain short transactions (insert/upsert + optional read in the same tx only where SQLite already did).

### Onramp payments (crypto)

- Tables in schema **`lawdog_onramp_payments`** (`CLAW_PG_SCHEMA_ONRAMP_PAYMENTS`): `payments`, `crypto_receipts`, `claw_keys` (onramp mirror rows), `reserves`, `payment_canonical_events`, `webhook_idempotency` — same constraints as SQLite (`provider_payment_id` and `tx_hash` and `event_sha256` UNIQUE; webhook idempotency PK `(provider, idempotency_key)`).
- **Migrations:** `backend/payments/migrations/postgres/*.sql` on first use (`ensure_onramp_payments_schema` from `OnrampStore.init_schema`).
- **Semantics:** `settle_onramp_payment` / `process_payment` / `reconcile_hourly_cycle` unchanged; **Stripe** billing webhooks stay on **`EconomicsStore`** (`insert_stripe_webhook_event_once`), not this store.

## Semantics preserved

- Text primary keys, ISO-8601 timestamps (Postgres stores compatible `TIMESTAMPTZ`).
- Batch close serialization: SQLite `BEGIN IMMEDIATE`; Postgres **`pg_advisory_xact_lock`** on the same code paths.
- Proof / anchor job behavior unchanged; only the connection and DDL dialect differ.

## Local / staging / prod

- **Local:** omit URL → SQLite under `CLAW_DATA_DIR` (or set URL to a local Postgres for anchoring-only tests).
- **Staging/prod (single-DSN):** set `CLAW_DATABASE_URL` to the managed instance; run API + worker with the **same** URL; per-store schemas remain distinct via `CLAW_PG_SCHEMA_*`.

## Worker / concurrency

- Short transactions per store method (unchanged).
- Postgres row-level locks + advisory lock replace SQLite exclusive batch transactions for contested paths.
- No new queue or microservice: same worker process, same call graph.

## Health vs readiness (HTTP)

| Route | Role |
|-------|------|
| `GET /v1/healthz` | **Liveness** — process is up; does not touch the database. |
| `GET /v1/readyz` | **Readiness** — for each **configured** Postgres launch domain (anchoring, agreements, timeline, affiliate ledger, operator alerts, onramp payments), runs `SELECT 1` with that domain’s `search_path`. Returns **503** if **any** such probe returns `error`. Domains on SQLite report `skipped` and do not fail readiness. **Usage-economics metering Postgres is not probed here** (avoid LB drain on metering-only outages); use deploy-readiness for that. |

Orchestrators may point load balancer health checks at **`/v1/readyz`** when you want traffic dropped if core Postgres is down; keep **`/v1/healthz`** for restart/kill probes if you split liveness vs readiness.

Operator aggregate: `GET /admin/deploy-readiness` includes Postgres pings for the domains above plus **`usage_economics_postgresql`**, SQLite pings where still used (`economics_sqlite`, `agreements_sqlite` when agreements are on SQLite, `timeline_db` / `usage_economics_db` / `onramp_payments_db` when those stores are on SQLite), and marks **critical** failures per configured backend (Postgres key when that domain uses PG; corresponding SQLite key when not).

## Backup, restore, and PITR (minimal commercial posture)

- **Automated backups:** enable the managed provider’s continuous / daily backups on the anchoring instance; retention per your compliance and cost envelope.
- **Restore drill:** periodically restore to a **non-production** clone (or fresh instance) and run `AnchoringStore.init_schema()` / smoke against that clone—prove you can recover, not just that backups exist.
- **PITR:** if the product warrants sub-daily recovery, enable **point-in-time recovery** (WAL/archiving) per vendor docs; know your **RPO** (max data loss window) and **RTO** (time to restore) from the provider’s SLA and your runbook steps—not from this app.
- **Secrets:** backups contain the same data as primary; protect backup storage IAM and encryption like production.

## Follow-on ports

Repeat the pattern in `backend/db/` for each store: dialect-specific migration folder, unified connection wrapper, remove `PRAGMA`/`executescript` from the hot path for Postgres.
