# Staging deployment proposal — customer-meaning offline correction

Do **not** push or deploy until this proposal is explicitly approved.  
This evaluation does not authorize launch. Official stub gate on this source is **not green**.

## Candidate

- Branch: `stabilize/phase3b-paid-entry`
- Base HEAD before this checkpoint: `6ebace85109fda42065fd653ff9fab6dec2a3a73`
- Candidate commit: `d6a6b539e7c82dc7dcca8ee180e0664e3f3aae01`
- Offline proof: `evals/commercial-readiness/results/quality-eval-offline-journey/20260914T204736Z-13517` (`OFFLINE_JOURNEY_PASS`, `model_calls=0`)
- Official stub gate: `6ebace85109fda42065fd653ff9fab6dec2a3a73+src-33b6422e9e5d04aa7df3ff3823e640de4d456b6b+run-20260914T205116Z-13943` — **14/18**, C4 and payment-reload failed desktop+mobile. Preserve that dir.
- Artifacts: production frontend build from `frontend/` (`npm run build`) and backend `uvicorn backend.main:app` as in `Dockerfile`
- Excluded from the commit: `evals/commercial-readiness/results/**`, official ledger, Railway/OpenAI credentials, activated increment policy copy

Replay boundary (do not collapse): captured Harbor parse + premium-full-draft **bodies** are live-model evidence. Transforms, sanitizer, date/payment guards, display, Apply, GET, and reopen are current product code. SaaS used the acceptance stub. This is **not** fresh-model evidence.

## Currently deployed staging (do not treat as this candidate)

| Service | Domain | Live deployment | Observed revision |
|---|---|---|---|
| Frontend `believable-gentleness` | https://believable-gentleness-staging.up.railway.app | `47d2c00a` (2026-09-08) | Build **`160079e\|2026-09-08T172109`** on `rc/gtm-certified-20260825` |
| Backend `claw-protocol` | https://claw-protocol-staging.up.railway.app | `c60a9aeb` (2026-09-07) | commit **`72b1b5a`** on `rc/gtm-certified-20260825` |

Production remains `main` from 2026-08-25 (`a9102eb4` / `8f128121`) and is not the target.

## Differences that matter for hosted review

- Explicit customer scope now outranks industry inference from entity names.
- Premium request no longer carries biotech/CRM/campaign/sales contamination or a starter convenience-termination default as if it were a customer fact.
- Display sanitizer strips unsupported additions without replacing a valid Services section.
- Official fingerprint changed because `llm_router.py` can replay captured Harbor bodies in local/test only. Production never honors the replay directory.
- Official C4 / payment-reload are **unverified on this fingerprint**. Do not deploy as if those rows were still closed.

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

Do not deploy until official C4 and payment-reload are green on this source. If later approved:

1. Signed-out `/app` and an owner agreement URL require sign-in.
2. Genuine hosted session reaches the entitled workspace.
3. Paid `/app/create` shows entitled intake (do not submit a live draft).
4. Resume an existing agreement, reload, confirm the same paper.
5. Logout returns dashboard and owner agreement URLs to sign-in required.

## Prior hosted evidence (older deploy only)

Admin-assisted staging test login on **`160079e`** reached dashboard, paid Create, resume `49d15cdc-09c8-44a8-bea5-a5f55f84ef`, reload, and logout. That is **not** evidence for this candidate. Customer-initiated magic-link / email delivery remains **unverified**.

## Approval requested

**Do not deploy this checkpoint** while official stub gate is red. When C4 and payment-reload are re-closed, deploy frontend and backend to Railway **staging** only. No production deploy, no increment policy, no provider drafting in the verification pass.
