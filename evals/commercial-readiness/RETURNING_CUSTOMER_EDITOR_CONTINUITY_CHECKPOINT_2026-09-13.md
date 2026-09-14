# Returning-customer editor continuity — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `68775a946b09a48708fb4ef6eff55e327acea7ed` — “Record revision-isolation checkpoint.” Working tree was clean except untracked `evals/commercial-readiness/results/`. Nothing was reset or overwritten. Nothing was pushed.

## Committed source mapping

Official C3/C4 close ran against the uncommitted working tree at HEAD `68775a946b09a48708fb4ef6eff55e327acea7ed` with source fingerprint `185caa72f8f6a3c6c444dd22163afa65d032219b`:

`68775a946b09a48708fb4ef6eff55e327acea7ed+src-185caa72f8f6a3c6c444dd22163afa65d032219b+run-20260914T143749Z-71780`

The continuity implementation and tests were later committed as `22e2a03eeffd5785ca3284a1ec206a1d864e803e`. That commit’s hashed product/test files produce the same fingerprint `185caa72f8f6a3c6c444dd22163afa65d032219b`. Historical `evals/commercial-readiness/results/**` directories remain uncommitted.

This is **not** a launch authorization and is **not** a live-model quality pass. No provider calls, deployment, billing changes, ledger writes, Stripe/email, or unrelated sitemap/feature work.

`canProceedWithoutAnswer: true` is unchanged. Harbor filled intake is unchanged: fixed $48,000, no invoicing schedule, no net-30.

## What this batch made mandatory

The core journey matrix is **16** rows. Missing desktop or mobile results fail the gate (`viewport_incomplete`).

- `C3_fresh_context_editable_reopen` — new authenticated context, `/app/create?agreementId=`, editable document shows latest authorized paper.
- `C4_resume_apply_after_dashboard_reset` — save “Invoice monthly”, dashboard Create-new reset, reopen, enter “Payment due net 60”, Apply must finish a durable revision.

Fresh-context `/view` remains a separate regression.

## Root cause

`/view` always GETs the canonical snapshot. `/app/create?agreementId=` previously hydrated only when draft-pipeline text was already long, so latest paper that lived only in the snapshot registry never painted.

After dashboard reset, Apply’s handler was keyed by revision identity that did not exist yet, and intake/structured draft were gone. A pending answer in `claw_payment_clarification_v1` is not enough. Even after the handler rebound, Apply could persist a new snapshot while the live revision view was unset, so display mutations were skipped (`display_identity_changed` when live view is missing).

## Customer-visible change

Opening `/app/create?agreementId=` now always attempts authorized snapshot GET and paints that paper for the same agreement/revision. It does not mint a replacement agreement.

After reset, Apply can restore intake/structured draft from live state, stored payment intake, or authorized GET, rebind to the live paper, and persist a new revision. Prior “Invoice monthly” is reused only when the authorized paper already confirms it.

## Official results (do not collapse)

### C3 — fresh-context editable reopen

| Viewport | Result | Binding |
|---|---|---|
| Desktop | **pass** | Official `src-185caa72f8f6` — agreement `a3d7b8f3-3e4a-4adf-aa7e-516e3b688676`, snapshot `crs_b7f3cd70f3ed4dbd917e8692786a4ba3`, digest `06b80a49…` |
| Mobile | **pass** | Official `src-185caa72f8f6` — agreement `c94a2475-e84b-40ec-9938-71a1022f55a0`, snapshot `crs_c98532c2266140c9865e8d90ba327486`, same digest |

First official C3 close: `68775a94+src-8b4e0af052f5+run-20260914T034149Z-52850`.

### C4 — Resume and Apply after reset

| Viewport | Official gate row | Evidence on `src-185caa72f8f6` |
|---|---|---|
| Desktop | **pass** (closed) | agreement `92ff3b21-74a7-4a9e-bf99-a7696b9a09d3`; monthly `crs_602713f1…` (2827); Apply `crs_9ce48a46…` (2908, digest `b4cc358c…`) |
| Mobile | **pass** (closed) | agreement `08e8cef3-e7eb-4c05-b165-29d161be2b24`; monthly `crs_6ec52bec…` (2827); Apply `crs_5e4b6590…` (2908, same digest) |

C4 **server persistence** was already demonstrated on the failed official run `68775a94+src-faecc6ebfd2f+run-20260914T044437Z-61434` (desktop `453d7ba8-…` / `crs_11ee0155…`; mobile `dfad3eeb-…` / `crs_ebfbd580…`) and earlier `src-116906b6c009`. Customer-visible completion is closed only on `src-185caa72f8f6`.

Later C4 gate failures (preserved): apply-unavailable (`src-8b4e0af052f5`), 5s error poll (`src-b0cfa70ceef8`), visible-document poll timeout after persist (`src-116906b6c009`, `src-534cd6f8b9dc`), hung snapshot GET (`src-5bcb1295d3cc`), empty POST-body corpus parse / 600s alert wait (`src-faecc6ebfd2f`).

## Focused checks and production build

- New hydration + Apply-recovery vitest: pass
- Payment session / consulting notice-order / family regression: pass
- Backend `test_payment_clarification_guard.py` + `test_unconfirmed_payment_timing_replay.py` + `test_core_paid_journey_acceptance.py`: pass
- Production `tsc -b && vite build`: pass (2026-09-14T14:38:29Z) on the same frozen fingerprint as the official gate

## Changed files (uncommitted)

- `frontend/src/components/agreements/paidCreateResumeHydration.ts` (+ test)
- `frontend/src/components/agreements/paymentClarificationApplyRecovery.ts` (+ test)
- `frontend/src/components/agreements/paymentClarificationSession.ts` (+ test)
- `frontend/src/components/agreements/AgreementBuilderIntake.tsx`
- `frontend/src/components/agreements/PaymentClarificationAdvisory.tsx`
- `frontend/src/launch/corePaidJourneyAcceptanceMatrix.ts`
- `frontend/src/launch/corePaidJourneyAcceptanceCoverage.ts` (+ test)
- `frontend/e2e/core-paid-journey-live/corePaidJourneyAcceptance.live.spec.ts`
- `scripts/run_core_paid_journey_acceptance_gate.sh`

`evals/commercial-readiness/results/**` is evidence only and must not be committed.

## Remaining defect and next bounded acceptance requirement

C3 and C4 are **closed** on official identity `68775a946b09a48708fb4ef6eff55e327acea7ed+src-185caa72f8f6a3c6c444dd22163afa65d032219b+run-20260914T143749Z-71780` (16/16 tests; 32/32 viewport rows; `gate_green=true`). This is **not** a launch authorization.

**Next bounded requirement:** do not expand this implementation batch. Broader live-model quality remains **not verified on this candidate**; budget reconciliation is a prerequisite for any future live-model evaluation, not its quality acceptance criterion. Billing, delivery launch, tenant/ops campaign, sitemap/claims, and date/acceptance-detail gaps stay visible and unchanged. Keep `canProceedWithoutAnswer: true`.
