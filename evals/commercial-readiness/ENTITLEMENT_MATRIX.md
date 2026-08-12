# Entitlement capability matrix (commercial beta contract)

**Status: RESOLVED** — founder commercial beta model locked.

## Authoritative product contract
1. Buyer-facing plans: **Guest** and **Pro** only
2. **Plus is retired** — must not appear in UI, checkout, Stripe mapping, entitlements, docs, analytics, or tests
3. **Pro = $99/month**, **25 successfully finalized premium agreements** per billing period
4. Failed generations, previews, retries, and system repairs **do not** consume quota
5. **Genesis is an affiliate/partner status**, never a buyer plan or drafting entitlement
6. Genesis commission = **$29.70** on the **first** successfully settled Pro invoice, payable after the refund window
7. Backend `resolve_commercial_entitlement` is the sole SoT for create/capability decisions
8. Notice emails are **never invented** — missing values stay unresolved until entry or explicit omission
9. Termination/acceptance substance only from **approved templates, custom input, or explicit omission**

## State model

| Axis | Values | Grants create? |
|---|---|---|
| Buyer plan (`state`) | `guest` \| `pro` \| `none` | guest temp only / Pro / no |
| Affiliate status | `none` \| `genesis` | **never** |
| Legacy `genesis_dog_entitlements` | readable via `legacy_genesis_create_grant` | **never** (migration required → Pro) |

See `GENESIS_CREATE_GRANT_MIGRATION.md` for inventory SQL. New Genesis create grants return HTTP **410**.

## Enforcement sources
- `backend/usage_economics/commercial_entitlement.py` (Pro meter = `agreements_finalized_since`; `affiliate_status`)
- `backend/usage_economics/policy.py`
- `backend/usage_economics/genesis_dog_entitlement.py` (issuance retired)
- `backend/billing/subscription_authority.py` / `pricing.py`
- `backend/affiliates/genesis_stripe_handlers.py`
- FE: `frontend/src/access/commercialEntitlement.ts`, `authenticatedWorkspaceAccessPolicy.ts`

## Capability matrix

| Capability | Guest (`anon-*`) | Pro | Authenticated `none` | Genesis affiliate |
|---|---|---|---|---|
| Temporary draft | Y (max 1) | N/A | N | N |
| Persist to workspace | N | Y (within finalize quota) | N `entitlement_required` | N |
| Quota unit | 1 temp | **25 finalized** / billing period | 0 | Commission role only |
| Premium full draft | N | **Y** | N | N |
| Invite review / share / sign / proof | N | Y | N | N |
| Checkout | → Pro ($99) | renew / cancel | → Pro | Earn $29.70 on first settled Pro invoice |

## Test harness rule
Helpers must grant **Pro** for owner headers. Genesis affiliate tests must not invent a buyer SKU. `ensure_user_genesis_entitlement` now grants Pro on `user-{uid}` for compat.
