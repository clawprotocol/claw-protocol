# Phase 4C.2.3 checkpoint — signing acceptance (close)

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `979c88c1` (`979c88c167233ffdca38e65079af57117623d187`) — prior 4C.2.3 truth checkpoint  
Nothing was pushed. This is **not** a launch authorization.

**Not begun:** Billing, Settings, operator/admin, remaining sitemap coverage, full-suite reconciliation, live staging proof.

Phase 4C.2.3 signing acceptance is closed. Independent audit failures at `979c88c1` were reproduced on production TestClient handlers, then repaired. Billing was not started.

## Audit reproduction at `979c88c1`

Using production TestClient handlers and the existing `_prepare` fixture:

| # | Reproduction | Result at `979c88c1` |
|---|---|---|
| 1 | `_complete_json(...).assigned_fields[0].page_index = 999` | **200**, `fully_executed=true`, `receipt_status=issued` |
| 2 | Complete normally, then `GET /api/agreements/access/validate` with that signer token | **403 `signing_complete`**. Production bootstrap calls validate before packet `signer_already_completed`. |
| 3 | Authenticated owner POST of the recipient role/participant/document to `vs01-signer-complete` with no fields or consent | **200**, `fully_executed=true` |

## Acceptance criteria

| ID | Criterion | Evidence | Remaining blocker |
|---|---|---|---|
| A | Signer authority on every commercial completion entry. Ownership cannot sign another participant. Owner signing is the owner’s authorized role + real ceremony. A signed-in browser carrying a recipient token keeps recipient authority. Rejected requests leave audit, private execution, ledger, receipt, and finalization unchanged. | `test_repro_owner_cannot_complete_recipient_without_ceremony`, `test_owner_ceremony_still_signs_owner_role_only`, `test_drafted_recipient_ceremony_rejects_owner_impersonation`; live Quick impersonation **403 `owner_cannot_complete_other_signer`**. Recipient token + owner headers → `auth_mode=recipient`. | None for this close. |
| B | Locked field manifest is authority (id, assigned signer, type, page, requiredness, document, packet revision). Reject altered type/page, unknown/unassigned fields, missing required initials/signatures, absent locked authority. Explicit optional fields stay optional. Client field defs are not authority. | `test_repro_altered_page_index_must_not_complete` (**400 `field_page_mismatch`**, no audit/receipt), `test_altered_field_type_is_rejected`, `test_unknown_field_and_replaced_invitation_fail_closed`. Validated values use locked type/page. | None for this close. |
| C | Completed-signer refresh is a server-authorized recovery bound to the exact signer and completing invitation. Does not reopen signing, disclose another party, or revive revoked/replaced invitations. Actual bootstrap sequence is tested (validate → packet GET). | `test_repro_completed_signer_validate_then_bootstrap` (validate **200** + `signer_already_completed`, packet **200**). Replaced JTI stays **403 `invite_superseded`**. Live Quick reload restores completed UI after real validate+packet. | None for this close. |
| D | UI success requires matching completed status and agreement/document/signer/participant/revision. HTTP 200 with missing or mismatched confirmation must not mark local signed state. | `confirmRecipientCompletionResponse` now requires those fields. `vs01SignerCompletionSync` + drafted `confirmDraftedCeremonyCompletion`. Unit: 200 without confirmation → `completion_confirmation_mismatch`. | None for this close. |
| E | Enforceable deployment-readiness for the supported persistence topology. Replay compares evidence digests **and** document id/hash + packet revision. | `completion_persistence_ready()` opens SQLite and `SELECT`s. Commercial/prod/staging without a ready ledger → **503 `completion_ledger_unconfigured`**. `test_commercial_completion_requires_openable_ledger` (503, no side effects, then retry issues one receipt). `test_replay_identity_mismatch_is_not_exact_replay` → **409**. Limits documented on `completion_persistence_ready()`. | Multi-worker still requires a **shared** `CLAW_DATA_DIR` or `CLAW_VS01_COMPLETION_LEDGER_PATH`. Unsynchronized disks are not safe. Python `RLock` is not the uniqueness guarantee. |

## Proofs this close

| Case | Result |
|---|---|
| Valid owner ceremony | Owner role still requires fields+consent (`400` without ceremony). Quick owner-complete path unchanged. |
| Valid recipient signing | Quick recipient complete **200** with matching `completion` + one issued receipt. Drafted ceremony complete **200** with `agreement_id` / `participant_id` / status. |
| Impersonation | Owner → recipient **403**, no audit / private execution / receipt / finalization. |
| Malformed fields | Page/type/unknown field rejected; state unchanged; retry then succeeds once. |
| Refresh / bootstrap | Validate after complete is **200 `signer_already_completed`**; packet GET matches; live reload shows completed UI. |
| One durable receipt | Completion issues one receipt; later GET is identical; POST receipt is not a writer (`404/405/422`). |
| Replaced invitation | Superseded token cannot recover; completing token can. |
| Live browser | Playwright against isolated uvicorn **4182** + Vite **4183**: Quick UI sign + refresh **PASS**; drafted ceremony API + sign-page load **PASS** (`2/2`). |

Named acceptance gate: `scripts/run_phase4c23_signing_acceptance_gate.sh`  
Live result path tag: `evals/commercial-readiness/results/phase4c23-signing-acceptance/<commit>-live-4182-4183` (working-tree run used `979c88c16723-live-4182-4183`).

## Persistence topology — limits

Supported: workers share `CLAW_DATA_DIR` or `CLAW_VS01_COMPLETION_LEDGER_PATH`, and this process can open the SQLite ledger and `SELECT` from `signer_completions`. Path existence alone is not readiness. Commercial / production / staging fail closed with **503** when that check fails. Limits: unsynchronized disks are unsafe; this check does not prove a remote replica; a process `RLock` is never the uniqueness guarantee.

## Verification (required order)

| Step | Result |
|---|---|
| Signing acceptance API | **10/10** (`test_phase4c23_signing_acceptance.py`) |
| Live backend browser (4182/4183, isolated `CLAW_DATA_DIR`) | **2/2** |
| Phase 4C.2.3 named truth gate | Official script **PASS** — backend **7/7**, contract **10**, Playwright **6/6** |
| Phase 4C.2.2 | Official script **PASS** — backend **9/9**, Playwright **6/6** |
| Phase 4C.2.1 | Official script **PASS** — **10/10** |
| Phase 4C.1 | Official script **PASS** — **12/12** |
| Phase 4C.2 | Official script **PASS** — **14/14** |
| Phase 4B.4 | **16/16** (fixture completion confirmation updated for the required response contract) |
| Phase 4B.2 | Official split **14/14 + 2/2** |
| Batch 5 | **2/2** |
| Phase 1 | **18 files / 100 passed** |
| Phase 2 | **exit 0** (frontend **97 files / 932 passed**; backend ownership/security dots **121**) |
| Relevant backend document / sign / receipt / token / ownership / replay / bundle | **146 passed / 0 failed** including 4C.2.3 acceptance (10), 4C.2.3 truth (7), 4C.2.2 (9), 4C.2 envelope, accepted-snapshot, JTI, packet token, layout auth, P0, signer-complete, receipt bundle, completion evidence, read scope, frozen authority, envelope tamper |
| Production build | `tsc -b && vite build` — **✓ built in 7.99s** |
| Complete frontend suite | **Not re-run this close.** Historical remainder reference remains `9,505 / 9,309 / 196`. Prior 4C.2.3 truth run was `9,536 / 9,338 / 198`. Do **not** establish a new baseline. |

## Release register — still visible, not begun

| Item | Status |
|---|---|
| Billing | Not begun |
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

Gate scripts kill their Vite child trees. After preservation and the live 4182/4183 run, those ports were stopped. Ports **4176–4183** were idle. No `pkill node` / `pkill python`.

## Authority contracts preserved

- Phase 4C.2.3 recipient-completion truth, forged `signed_at`, and durable receipts remain.
- Phase 4C.2.2 uploaded-PDF receipt issuance, GET read-only, and artifact identity remain.
- Phase 4C.2.1 uploaded-PDF authority, placement, owner ceremony, and JTI-only tokens remain.
- `/app/esign/:documentId` remains 4B.4 dual-mode, now with required completion confirmation.
- Phase 4B.2 `/agreements/:id/sign` still requires a public recipient token and consent before enable.
- Batch 5, Phase 1, Phase 2, backend ownership/security, and production build remain green.
- Drafted-agreement `receipt.v1` hashing is unchanged.
- No launch claim.

## How to re-run

```bash
scripts/run_phase4c23_signing_acceptance_gate.sh
scripts/run_phase4c23_recipient_completion_truth_gate.sh
scripts/run_phase4c22_quick_receipt_integrity_gate.sh
scripts/run_phase4c21_quick_integrity_gate.sh
scripts/run_phase4c1_quick_intake_browser_gate.sh
scripts/run_phase4c2_quick_completion_browser_gate.sh
scripts/run_phase4b4_esign_browser_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
(cd frontend && npx playwright test --config playwright.phase4a.config.ts -g "Batch 5" --workers=1 --retries=0)
scripts/run_phase1_access_contract_gate.sh
scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build)
```
