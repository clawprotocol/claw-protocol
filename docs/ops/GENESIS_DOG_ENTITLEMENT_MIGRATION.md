# Genesis Dog entitlement migration + staging runbook

## Authority

Long-term commercial Genesis Dog access is stored in `genesis_dog_entitlements`.
`genesis_affiliates` remains the affiliate/commission surface and is **not** the permanent create-access authority.

## Precedence

1. Active (non-expired) `genesis_dog_entitlements` → grant
2. Explicit revoked/expired entitlement row → deny (even if affiliate is active)
3. No entitlement row → temporary dual-read of active `genesis_affiliates` (`grant_source=legacy_affiliate`, logged as `genesis_legacy_affiliate_fallback`)

## Schema deploy order

Migrations (usage-economics Postgres):

1. `backend/usage_economics/migrations/postgres/005_genesis_dog_entitlements.sql`
2. `backend/usage_economics/migrations/postgres/006_guest_temp_agreement_owner.sql`

**Auto-apply:** on backend start / first `UsageEconomicsStore.init_schema()`, Postgres runs all `migrations/postgres/*.sql` in sorted order (`ensure_usage_economics_schema`). SQLite applies equivalent DDL in `init_schema()`.

**Must they run before the new backend starts?** Prefer yes for operator certainty, but not strictly required: the new backend applies them on first usage-economics touch. Until then, dual-read keeps active affiliates working.

**Unmigrated DB:** new code references `genesis_dog_entitlements` / `guest_temp`. Safe path is init_schema before create/entitlement paths (already called from policy/resolver). Do not serve create traffic against a DB where migrations were blocked.

### Safest zero-downtime staging sequence

1. Deploy **backend** (schema auto-migrates; dual-read preserves affiliate Genesis access).
2. Dry-run backfill → verify counts.
3. Apply backfill.
4. Deploy **frontend**.
5. Smoke test Guest / Genesis / Pro / admin grant-revoke.

## Backfill

### Dry-run

```bash
cd /app   # or repo root with staging env vars
PYTHONPATH=. python scripts/migrate_genesis_dog_entitlements_from_affiliates.py --dry-run
```

Expected JSON shape:

```json
{
  "ok": true,
  "counts": {
    "dry_run": true,
    "active_affiliates": <N>,
    "candidates": <C>,
    "would_insert": <C>,
    "would_insert_user_ids": ["..."],
    "skipped": <S>,
    "skipped_revoked_or_expired": <R>,
    "inserted": 0
  }
}
```

### Apply (idempotent)

```bash
PYTHONPATH=. python scripts/migrate_genesis_dog_entitlements_from_affiliates.py
```

Or admin (requires `ops:mutate_admin` + secret + reason):

`POST /v1/admin/genesis-entitlement/migrate-legacy-affiliates`  
body: `{"reason":"staging_legacy_backfill","dry_run":true|false}`

### Expected row checks

```sql
-- After schema
SELECT to_regclass('genesis_dog_entitlements');
SELECT column_name FROM information_schema.columns
 WHERE table_name='agreement_owner' AND column_name='guest_temp';

-- After backfill
SELECT count(*) FROM genesis_affiliates WHERE lower(affiliate_status)='active';
SELECT count(*) FROM genesis_dog_entitlements WHERE grant_source='legacy_migration' AND status='active';
-- active affiliates without entitlement row should be 0 (dual-read idle)
```

## Admin / security

- Grant/revoke: `POST /v1/admin/users/{user_id}/genesis-entitlement/{grant|revoke}`
  - Requires verified operator principal + `ops:mutate_support` + admin secret + nonempty reason
  - Audited via `admin_action_audit`
- Migrate legacy: `ops:mutate_admin` only
- `POST /v1/workspace/genesis-access-request` records a request only — **never grants**
- `support_operator` bootstrap does **not** write `genesis_dog_entitlements`

## Rollback if staging smoke fails

1. Keep dual-read in place (do not remove affiliate fallback).
2. Do **not** drop `genesis_dog_entitlements` / `guest_temp` (additive; leaving them is safe).
3. If a bad grant was applied: admin revoke that user (explicit deny beats affiliate).
4. If backfill was wrong: revoke specific rows; dual-read will **not** restore access once a revoked row exists — re-grant with `grant_source=admin` if needed.
5. Frontend rollback: redeploy previous frontend build (API still returns compat `commercial.entitlement` aliases).
6. Backend rollback to prior SHA only if necessary; schema columns/tables can remain.

## Follow-up

Watch logs for `genesis_legacy_affiliate_fallback`. When count is ~0, remove dual-read in a later release.
