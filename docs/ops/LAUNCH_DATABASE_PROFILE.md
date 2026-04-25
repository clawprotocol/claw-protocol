# Launch database profile (recommended Postgres posture)

Canonical guidance for **staging and production** so operators do not accidentally run a **partially split** Postgres configuration. Full technical detail: [Postgres day-one](../architecture/POSTGRES_DAY_ONE.md).

---

## TL;DR (preferred launch posture)

| Do | Do not (unless intentional) |
|----|-----------------------------|
| Set **one** shared `CLAW_DATABASE_URL` or `DATABASE_URL` (`postgresql://…`) on API + worker | Set **only** one domain-specific DSN (e.g. only `CLAW_ANCHORING_DATABASE_URL`) and expect every other domain to follow — they will **not** unless each store’s resolver also sees a Postgres URL |
| Rely on **`CLAW_PG_SCHEMA_*`** defaults for schema separation on that single database | Assume table names alone avoid collisions without `search_path` — the app sets `search_path` per connection |
| Keep **`CLAW_DATA_DIR`** consistent across API and worker | Point API and worker at **different** Postgres instances without a migration/replication story |

**Still file-backed at many launches:** `economics.sqlite3`, treasury SQLite, anchor queue / usage DB, feed DB — that is expected; see deploy-readiness checks.

---

## Store-specific DSNs — usually **unset** at launch

Leave **all** of these **unset** so every store falls through to `CLAW_DATABASE_URL` / `DATABASE_URL`:

- `CLAW_ANCHORING_DATABASE_URL`
- `CLAW_AGREEMENT_DATABASE_URL`
- `CLAW_AFFILIATE_LEDGER_DATABASE_URL`
- `CLAW_OPERATOR_ALERTS_DATABASE_URL`
- `CLAW_TIMELINE_DATABASE_URL`
- `CLAW_USAGE_ECONOMICS_DATABASE_URL`
- `CLAW_ONRAMP_PAYMENTS_DATABASE_URL`

Set one or more **only** when ops **explicitly** wants a second cluster (blast-radius isolation, compliance boundary, etc.) and documents backup/restore and connection budgets per instance.

---

## Accidental mixed configuration (watch for this)

- **Symptom:** API has `CLAW_DATABASE_URL` set, but someone also set `CLAW_TIMELINE_DATABASE_URL` to a **different** host from a stale runbook or copy-paste — timeline writes go to instance B while anchoring/agreements use instance A → broken proof spine and confusing readiness.
- **Mitigation:** Prefer **deleting** domain-specific DSNs from the secret/env store unless the split is documented in your internal runbook.
- **Verification:** `GET /admin/deploy-readiness` — confirm each `*_postgresql` check’s implied host matches your intent (schema name is in the JSON; compare connection targets in your platform UI).

---

## Example: staging (single DSN)

```bash
# Core: one Postgres for all domain schemas
export CLAW_ENVIRONMENT=staging
export CLAW_DATA_DIR=/var/lib/claw
export CLAW_DATABASE_URL="postgresql://USER:PASS@staging-db.example.com:5432/lawdog?sslmode=require"

# Explicitly: no per-store overrides (omit or comment out)
# export CLAW_ANCHORING_DATABASE_URL=...
# export CLAW_AGREEMENT_DATABASE_URL=...

# Optional: only if you must rename schemas (defaults are fine)
# export CLAW_PG_SCHEMA_ANCHORING=lawdog_anchoring
```

Worker on staging should use the **same** `CLAW_DATABASE_URL` and `CLAW_DATA_DIR` unless you have a deliberate split role.

---

## Example: production (single DSN)

```bash
export CLAW_ENVIRONMENT=production
export CLAW_DATA_DIR=/var/lib/claw
export CLAW_DATABASE_URL="postgresql://USER:PASS@prod-db.example.com:5432/lawdog?sslmode=require"

# Same rule: leave store-specific DSNs unset unless approved split-cluster design
```

Use your secrets manager; do not commit real URLs. Rotate credentials per provider policy.

---

## Intentional split-DSN (advanced)

Example: anchoring on a dedicated RDS instance, everything else on another.

```bash
export CLAW_DATABASE_URL="postgresql://...@main.example.com:5432/lawdog"
export CLAW_ANCHORING_DATABASE_URL="postgresql://...@anchor.example.com:5432/lawdog_anchor"
```

You must run migrations / `init_schema` paths against **both** databases, size **both** connection pools in your head (instances × concurrency), and document RPO/RTO **per** instance. This is **not** the default launch path.

---

## Related

- [Environment topology](../architecture/ENV_TOPOLOGY.md) — full variable index  
- [Deploy smoke test](DEPLOY_SMOKE_TEST.md) — post-deploy checks  
- `backend/db/config.py` — URL resolution order per store  
