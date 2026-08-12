# Genesis create-grant migration requirement (no irreversible data migration this pass)

## Before → after model

| Axis | Before | After |
|---|---|---|
| Buyer plan | `guest` \| `pending_genesis` \| `genesis` \| `pro` \| `none` | `guest` \| `pro` \| `none` |
| Create entitlement | Genesis 5/mo **or** Pro | **Pro only** (finalize meter 25) |
| Affiliate status | Coupled via dual-read → create | `none` \| `genesis` (commission only) |
| New Genesis create grants | Admin grant + backfill + dual-read | **Refused** (`410` / `GenesisCreateGrantIssuanceRetired`) |
| Existing `genesis_dog_entitlements` rows | Granted create | **Readable** via `legacy_genesis_create_grant`; **do not** grant create |

## Exact ops migration (manual / authorized)

1. Inventory active rows (do not delete):
   ```sql
   SELECT user_id, status, grant_source, expires_at, granted_at
   FROM genesis_dog_entitlements
   WHERE status = 'active'
     AND (expires_at IS NULL OR expires_at > NOW());
   ```
2. For each user who still needs buyer create: grant **LawDog Pro** via Stripe (or authorized support Pro activation) — not a Genesis create re-grant.
3. Confirm `resolve_commercial_entitlement` shows `state=pro` and `affiliate_status` independently.
4. Optional later: mark legacy rows `revoked` with reason `migrated_to_pro` — **not done in this RC** (avoids irreversible migration without staging evidence).

## Blockers if skipped

Users who only held Genesis create grants lose persisted create until Pro is granted. Affiliate dashboards and referral ops remain available.
