# CLAW launch smoke checklist

**Full operator timeline** (staging validation, load test, launch-day, rollback): [Launch operator playbook](ops/LAUNCH_OPERATOR_PLAYBOOK.md).

Repeat before tagging a release. Backend on port **8000**, frontend `npm run dev` (Vite) with proxy to API.

## Automated

- `make validate` — backend tests + frontend production build (ensure production CI sets **`VITE_LAWDOG_PRIVACY_EMAIL`** so LawDog ships with a real privacy inbox — see `docs/DEPLOY.md`)
- `cd frontend && npm test` — routing / hash unit smoke
- **Staging / deployed API:** `make deploy-smoke` with `CLAW_API_BASE` + `CLAW_ADMIN_SECRET` — canonical HTTP order in [docs/ops/DEPLOY_SMOKE_TEST.md](ops/DEPLOY_SMOKE_TEST.md); use `CLAW_DEPLOY_SMOKE_EXTENDED=1` for agreement + timeline API writes

## Manual flows

1. **Homepage** — Open `/`. Confirm headline, CTAs (create agreement, send for signature, pricing), disclaimer.
2. **App entry** — Click “Enter app workspace” or go to `/app`. Dashboard loads without a blank screen.
3. **Empty dashboard** — With no agreements API data, see guided CTAs (“Create your first agreement”, “Send your first document”).
4. **Create agreement** — `/app/agreements/new`. Complete or at least pass intake without hard crash; note any API error banner (not silent empty state).
5. **Quick / document send** — `/app/quick`. Pick PDF, type, or speak entry; upload or finalize without crash; gated steps show upgrade/limit copy if blocked.
6. **Billing** — `/app/billing`. Keys/subscription load or show a clear error + retry path; zero keys shows capacity message.
7. **Usage receipt** — `/app/receipts/<usage_id>` with a real id from a metered action, or confirm error panel + link to billing if missing.
8. **Feature gates** — `/feed` redirects to home unless `VITE_CLAW_FEATURE_PUBLIC_FEED=1`. No negotiation timeline when timeline flag off.

## Proof / determinism

- Do not edit canonical JSON, receipt hashing, or sign-packet normalization for UX; verification failures belong in product messaging, not weakened crypto.

## Sign-off

- [ ] No critical flow dead-ends  
- [ ] No silent API failures on dashboard, billing, or receipt pages  
- [ ] Payment webhook logs visible in server output when testing dev webhooks  
