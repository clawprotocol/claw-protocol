# Genesis Dog entitlement migration

## Authority

Long-term commercial Genesis Dog access is stored in `genesis_dog_entitlements`.
`genesis_affiliates` remains the affiliate/commission surface and is **not** the permanent create-access authority.

## Precedence

1. Active (non-expired) `genesis_dog_entitlements` → grant
2. Explicit revoked/expired entitlement row → deny (even if affiliate is active)
3. No entitlement row → temporary dual-read of active `genesis_affiliates` (`grant_source=legacy_affiliate`, logged as `genesis_legacy_affiliate_fallback`)

## Staging backfill

1. Identify active affiliates and insert missing entitlement rows:

```bash
python scripts/migrate_genesis_dog_entitlements_from_affiliates.py
```

Or via admin (privileged):

`POST /v1/admin/genesis-entitlement/migrate-legacy-affiliates` with reason.

2. Confirm usage summary for migrated users shows `state=genesis` and `grant_source=legacy_migration` (or `admin` after re-grant).
3. Watch logs for `genesis_legacy_affiliate_fallback` until the count is ~0.
4. Remove dual-read fallback in a later release once migration is complete.

Admin grant/revoke/expiry write **only** `genesis_dog_entitlements` and are audit-logged.
`support_operator` bootstrap never grants customer Genesis access.
