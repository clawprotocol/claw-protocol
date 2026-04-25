# LawDog testnet / hosted evaluation readiness

Short checklist for an externally hosted environment used for controlled testnet-style testing (not full enterprise hardening).

## Frontend build-time configuration

Set a **public API origin** when the SPA and API are not same-origin:

- Prefer `VITE_CLAW_API_BASE` or `VITE_API_BASE` (see `frontend/.env.example` and `docs/architecture/ENV_TOPOLOGY.md`).
- Production builds: an explicit base must not point at loopback; misconfiguration surfaces as an in-app banner (no raw env-var names shown to users). Operators see `console` hints where relevant.

**Privacy / data-rights inbox:** bake `VITE_LAWDOG_PRIVACY_EMAIL` into production-like builds so Privacy and related surfaces show a working mailbox. Missing value logs an **operator-only** `console.warn` at startup (`warnIfProductionMissingPrivacyInbox` in `frontend/src/main.tsx`).

Other optional gates (billing, features) follow existing `VITE_CLAW_FEATURE_*` / `VITE_CLAW_GATE_*` patterns in the repo.

## API base / origin behavior

- `resolveApiBase()` / `apiUrl()` in `frontend/src/lib/clawApi.ts`: explicit env wins; production with no env uses **same-origin** relative URLs (assumes API is reachable on the same host as the SPA or behind the same gateway).
- Development with no env falls back to `http://127.0.0.1:8000` for local backends.

## After deploy — smoke verification

1. **Homepage** — marketing shell, guarantee panel, sample-artifact previews, CTAs.
2. **Create flow** — intake → draft/review without hard dependency on prior local-only session (fresh browser / private window).
3. **Send flow** — paywall modal if applicable; conversion copy; signing handoff still works against configured API.
4. **Privacy contact** — privacy inbox visible and mailto/links behave as intended.
5. **Pricing / billing** — plans, guarantee copy, sample-artifact block.
6. **Sample-artifact visibility** — “See what you’ll get” blocks render on homepage, pricing credibility area, and send conversion (compact variant).

## Session / storage

Flows may use `localStorage` for continuity (e.g. draft prompts, re-engagement flags). On a fresh hosted test, behavior should degrade gracefully: empty storage should not block first-time create/send; users simply skip restored-draft hints.
