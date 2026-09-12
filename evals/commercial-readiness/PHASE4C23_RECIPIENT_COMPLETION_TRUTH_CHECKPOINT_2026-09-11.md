# Phase 4C.2.3 checkpoint — drafted confirmation + unsigned UI proof (close)

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `95519f73` (`95519f7315c9aa0fc8bf4116f2f388f870b00292`) — prior signing-acceptance checkpoint  
Nothing was pushed or deployed. This is **not** a launch authorization. Billing was not started.

**Not begun:** Billing, Settings, operator/admin, remaining sitemap coverage, full-suite reconciliation, live staging proof.

This close repairs only the remaining drafted-signing confirmation and browser-proof gaps before Billing.

## Reproduction at `95519f73`

`confirmDraftedCeremonyCompletion` accepted a 200 with matching `agreement_id` / `participant_id` / `signed_at` when `status` or `locked_version_id` was missing. Status was checked only if present; locked version was checked only when both sides had a value.

`AgreementRecipientReview.handleRecordSignature` treated `String(error).includes("already_signed")` as local success and set `ceremonyPhase` to `done` without token-authorized confirmation of participant, agreement, and locked version.

The live drafted browser case pre-completed through `POST /signing-ceremony/complete` and only asserted that the sign page loaded.

Recipient GET of a locked drafted agreement returned `signing_lock.content_sha256` but no corpus length, so `selectRecipientReviewAuthorityMeta` was null and `signPaperAuthorityClosed` failed closed (`This link is invalid or expired`) before the unsigned UI could be used.

## Closures this batch

| ID | Criterion | Evidence | Remaining blocker |
|---|---|---|---|
| D+ | Drafted UI success requires explicit confirmed completion **and** the expected locked version. Missing or mismatched `status` / `locked_version_id` must not produce Signed / fully-executed UI. | `confirmDraftedCeremonyCompletion` now requires a confirmed status (`completed` / `already_signed` / `fully_executed`) and a matching `locked_version_id`. Coverage rejects missing status, missing lock, and lock mismatch. | None for this close. |
| Already-signed | No error-text shortcut to local success. Recover through authenticated / token-authorized server state and confirm the same participant, agreement, and locked version before showing completion. | Removed `includes("already_signed")`. `recoverDraftedCeremonyCompletion` uses `GET /access/validate` + token-authorized GET lock. `confirmDraftedCeremonyAuthorizedState` requires `signer_already_completed`, `completion_status`, matching ids. Start-effect recovery restores completed UI after refresh when recipient GET strips `audit_log`. | None for this close. |
| Live unsigned UI | Desktop and mobile start from an **unsigned** drafted agreement. Read verified locked paper, type name, consent, click **Agree and sign** through the actual UI. Assert matching durable completion, unchanged legal paper, and completed-state recovery after refresh without another completion event. Do not pre-complete through an API call. Retain owner-impersonation 403. | Live Playwright `4/4` (Quick + drafted × desktop/mobile) against isolated uvicorn **4182** + Vite **4183**. Impersonation still **403**. One `signing-ceremony/complete` POST; refresh posts none. Paper title / locked-corpus sentence / SHA-256 unchanged. | None for this close. |
| Lock paper | Recipient GET must expose enough lock identity for verified paper (version + SHA + length) without inventing a snapshot. | Signing lock now stores/returns `content_length`. `selectRecipientReviewAuthorityMeta` accepts lock-only sha + length. Live UI shows `recipient-review-authority-meta`. | None for this close. |

## Proofs this close

| Case | Result |
|---|---|
| Missing confirmation | `{ ok: true, agreement_id, participant_id, signed_at }` without status or lock → not confirmed. |
| Mismatched lock | Matching ids + `status=completed` + wrong `locked_version_id` → not confirmed. |
| Matching complete | `completed` + matching agreement / participant / lock / `signed_at` → confirmed. |
| `already_signed` error text | Recovery fetch of 409 `already_signed` without validate confirmation → `{ ok: false }`. |
| Authorized recovery | Validate `signer_already_completed` + matching party/lock + GET lock → `{ ok: true }`. |
| Live Quick | UI sign + refresh + one receipt (desktop and mobile). |
| Live drafted | Unsigned seed → read paper → Agree and sign → Signed UI → refresh without second complete (desktop and mobile). Impersonation 403 retained. |
| 4B.2 | Official split still **14/14 + 2/2** after the recovery/start-effect change. |

## Verification (this batch only — no full-suite re-run)

| Step | Result |
|---|---|
| Signing acceptance API | **10/10** (`test_phase4c23_signing_acceptance.py`) |
| Focused contract / recover tests | **PASS** (`phase4c23RecipientCompletionTruthCoverage`, `vs01SignerCompletionSync`, `recoverDraftedCeremonyCompletion`, `recipientReviewAuthorityMeta`) |
| Live backend browser (4182/4183, isolated `CLAW_DATA_DIR`) | **4/4** at dirty tree on `95519f73` |
| Phase 4C.2.3 named truth gate | Official script **PASS** — backend **7/7**, contract **10**, Playwright **6/6** |
| Phase 4B.2 | Official split **14/14 + 2/2** |
| Production build | `tsc -b && vite build` — **✓ built in 9.12s** (after the lock-length change) |
| Complete frontend suite | **Not re-run this close.** Historical remainder reference remains `9,505 / 9,309 / 196`. Prior 4C.2.3 truth run was `9,536 / 9,338 / 198`. Do **not** establish a new baseline. |

## Evidence locations

- Failed first live attempt (unsigned page fail-closed before lock length): `evals/commercial-readiness/results/phase4c23-signing-acceptance/95519f7315c9-live-4182-4183`
- Passing dirty-tree live run: `evals/commercial-readiness/results/phase4c23-signing-acceptance/95519f7315c9-dirty-live-4182-4183`
- Prior preserved live evidence (untouched): `evals/commercial-readiness/results/phase4c23-signing-acceptance/979c88c16723-live-4182-4183`

Named acceptance gate: `scripts/run_phase4c23_signing_acceptance_gate.sh`

## Tested SHA and dirty state

Started and tested from product HEAD `95519f7315c9aa0fc8bf4116f2f388f870b00292`. Working tree was dirty with this batch’s product, test, and checkpoint files. Untracked `evals/commercial-readiness/results/` from prior live runs was preserved. No push. No deploy.

## Release register — still visible, not begun

| Item | Status |
|---|---|
| Billing | **Next customer surface. Not begun.** |
| Settings | Not begun |
| Operator / admin | Not begun |
| Remaining sitemap coverage | Not begun |
| Full-suite reconciliation | Not begun this close |
| Live staging proof | Not begun |

## Remaining limitations

- Email delivery is still unavailable / non-authoritative.
- Public verify for uploaded PDFs still does not use drafted-agreement `receipt.v1` attestation.
- Multi-worker production requires a shared, openable ledger. Unconfigured topology is **503**, not a log-only warning, when commercial/prod/staging.
- No live email, Supabase, OAuth, Stripe, or staging claim.

## Terminal cleanup

This batch’s isolated 4182/4183 trees and the 4B.2 Vite child were stopped. Ports **4173–4183** were idle. No `pkill node` / `pkill python`. Prior untracked results were not deleted.

## Authority contracts preserved

- Phase 4C.2.3 recipient-completion truth, forged `signed_at`, and durable receipts remain.
- Phase 4C.2.2 uploaded-PDF receipt issuance, GET read-only, and artifact identity remain.
- Phase 4C.2.1 uploaded-PDF authority, placement, owner ceremony, and JTI-only tokens remain.
- `/app/esign/:documentId` remains 4B.4 dual-mode, now with required completion confirmation.
- Phase 4B.2 `/agreements/:id/sign` still requires a public recipient token and consent before enable.
- Drafted-agreement `receipt.v1` hashing is unchanged.
- No launch claim.

## How to re-run

```bash
scripts/run_phase4c23_signing_acceptance_gate.sh
scripts/run_phase4c23_recipient_completion_truth_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
(cd frontend && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build)
```
