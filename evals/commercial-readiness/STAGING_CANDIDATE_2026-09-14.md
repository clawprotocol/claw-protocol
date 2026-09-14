# Staging deployment proposal — local candidate after live increment

Do **not** push or deploy until this proposal is explicitly approved.  
This evaluation does not authorize launch.

## Candidate

- Branch: `stabilize/phase3b-paid-entry`
- Base HEAD before this checkpoint: `aaeabe9f46dbd4db42c4b057f5bb9ad4298fb803`
- Candidate commit: `3c279f3a89a73bbac3e6f2d0fe3eadc7dd073bf0`
- Artifacts: production frontend build from `frontend/` (`npm run build`) and backend `uvicorn backend.main:app` as in `Dockerfile`
- Excluded from the commit: `evals/commercial-readiness/results/**`, official ledger, Railway/OpenAI credentials, activated increment policy copy

## Currently deployed staging (do not treat as this candidate)

| Service | Domain | Live deployment | Observed revision |
|---|---|---|---|
| Frontend `believable-gentleness` | https://believable-gentleness-staging.up.railway.app | `47d2c00a` (2026-09-08) | Build **`160079e\|2026-09-08T172109`** on `rc/gtm-certified-20260825` |
| Backend `claw-protocol` | https://claw-protocol-staging.up.railway.app | `c60a9aeb` (2026-09-07) | commit **`72b1b5a`** on `rc/gtm-certified-20260825` |

Production remains `main` from 2026-08-25 (`a9102eb4` / `8f128121`) and is not the target.

This candidate is the unpaid-entry / session-lifecycle / evaluation-prep tree on `aaeabe9f` plus the uncommitted commercial-readiness work. It is **not** `160079e`.

## Differences that matter for hosted review

- Local AuthProvider / `currentUser` lifecycle (signed-out and failed-refresh ignore storage; JWT-shaped token required). **Not on staging `160079e`.**
- Evaluation checker and increment runner are local-only and must not change hosted model routing.
- Live Harbor painted-paper scope loss is a **product display** issue on this candidate’s production handlers; deploying will carry that behavior unless separately fixed under a new authorization.

## Configuration / migration

- No Stripe, ledger, or billing changes.
- No new accounts.
- Keep existing staging Supabase JWKS, `CLAW_STAGING_AUTH_EMAIL_ALLOWLIST`, and CORS origins.
- Do not attach or activate any increment policy on hosted environments.
- Do not copy `quality-eval-approved-20260913.sqlite3` or authorized increment JSON to staging.

## Rollback targets

- Frontend: redeploy `47d2c00a` / `160079e`
- Backend: redeploy `c60a9aeb` / `72b1b5a`

## Post-deployment verification (hosted, this candidate)

Use an existing authorized owner. Do not seed a synthetic JWT, create accounts, send customer email, or draft with the live provider.

1. Signed-out `/app` and an owner agreement URL require sign-in.
2. Genuine hosted session reaches the entitled workspace.
3. Paid `/app/create` shows entitled intake (do not submit a live draft).
4. Resume an existing agreement, reload, confirm the same paper.
5. Logout returns dashboard and owner agreement URLs to sign-in required.
6. If a second authorized session is available, confirm account/workspace isolation.

## Prior hosted evidence (older deploy only)

Admin-assisted staging test login on **`160079e`** reached dashboard, paid Create, resume `49d15cdc-09c8-44a8-bea5-0579f55f84ef`, reload, and logout. That is **not** evidence for this candidate. Customer-initiated magic-link / email delivery remains **unverified**.

## Approval requested

Deploy this checkpoint’s frontend and backend to Railway **staging** (`extraordinary-creativity` / environment `0a507476-6f9b-4170-9721-a1315f593de7`) only. No production deploy, no push requirement beyond whatever the operator uses to reach those services, no increment policy, no provider drafting in the verification pass.
