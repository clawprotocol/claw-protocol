# Staging one-shot operator bootstrap

Use this **only** to create the first `support_operator` on a staging API that has an empty `admin_users` registry. Production must never enable this path.

## Storage

Operator registry + audit live in the **admin console SQLite** store:

- Path: `CLAW_ADMIN_CONSOLE_DB_PATH` or `{CLAW_DATA_DIR}/admin_console.sqlite3`
- Tables: `admin_users`, `admin_action_audit`
- Not PostgreSQL (no Postgres admin-console backend in the current tip)

Bootstrap inserts the user row and the audit row in one SQLite `BEGIN IMMEDIATE` transaction.

## Prerequisites

1. Staging API with `CLAW_ENVIRONMENT=staging`
2. `CLAW_ADMIN_SECRET` configured
3. Supabase Auth JWKS configured for staging JWT verification
4. Operator’s Supabase user already exists (you will authenticate as that user)
5. No active operator in `admin_users` yet

## Procedure

1. **Temporarily enable** on the staging API only:
   - `CLAW_ALLOW_OPERATOR_BOOTSTRAP=1`
   - Redeploy / restart so the process sees the flag.

2. **Authenticate** as the intended staging operator (Supabase magic link / session). Capture a short-lived access token. Do not log the token.

3. **Bootstrap** (non-secret field names only):

```bash
curl -sS -X POST "$CLAW_API_BASE/v1/admin/operators/bootstrap" \
  -H "Authorization: Bearer <supabase_access_token>" \
  -H "x-claw-admin-secret: $CLAW_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"reason":"staging first support_operator bootstrap"}'
```

Expected `200`:

```json
{"ok":true,"user_id":"<jwt-sub>","role":"support_operator","audit_id":"...","created":true}
```

4. **Verify**
   - `GET /v1/admin/audit` (or inspect audit via a privileged ops call that writes audit) includes `action_type=operator_bootstrap`.
   - `GET /v1/genesis-referral/ops/summary` with the same JWT + `x-claw-admin-secret` + `x-claw-admin-reason` (≥3 chars) succeeds (`200`).
   - A second bootstrap returns `409` `operator_bootstrap_already_done`.
   - Ordinary user JWT cannot call privileged ops (`403`).

5. **Disable immediately**
   - Unset / remove `CLAW_ALLOW_OPERATOR_BOOTSTRAP` (or set to `0`).
   - Redeploy staging so bootstrap is disabled again.
   - Production must never set this flag.

## Fail-closed rules (summary)

| Condition | Result |
|-----------|--------|
| Env ≠ `staging` | `403` `operator_bootstrap_disabled` |
| Flag ≠ `1` | `403` `operator_bootstrap_disabled` |
| Missing/invalid JWT | `401` |
| Bad/missing admin secret | `403` |
| Short/missing reason | `4xx` |
| Body `user_id` / `role` | `422` (rejected) |
| Active operator already exists | `409` `operator_bootstrap_already_done` |
| Test-auth headers on staging | Ignored / `401` (not a valid principal) |

## Deactivation

Set `admin_users.is_active=0` for that operator id via controlled ops (no public deactivate API yet), then confirm privileged calls fail with `operator_role_required`.
