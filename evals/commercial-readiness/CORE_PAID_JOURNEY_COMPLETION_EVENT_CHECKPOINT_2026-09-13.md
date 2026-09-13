# Core Paid Journey completion-event regression checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `e506f54a` (`e506f54aa7c10771c24ccbe91884ef3d9bf9ad79`) — Core Paid Journey authority recovery and receipt-integrity checkpoint  
Nothing was pushed. This is **not** a launch authorization.

Prior official proofs remain separate and were not combined into this identity:

- Workflow milestone: `80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533+src-9506e8c8b01460dfcb3fd9f24989cb7896a62dcb+run-20260913T040043Z-79629`
- Integrity close: `80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533+src-d20519d460a25751c84125625484cdc87ac1732f+run-20260913T131709Z-88408`
- Authority/receipt close: `a5d9fed737a8563862ea02f94a01b3b717c0c05e+src-d8f4cd00647c2f4a1e0e73a8591154e16c5d6abf+run-20260913T144752Z-92137`
- Authority/recovery close: `a02ed76a6a45140ba7c06e983d51048a85197d04+src-495ff7bf1597fb3dd7ce20e86b6d0503df1a6b4b+run-20260913T151340Z-95076`

Official completion-event proof (one unchanged source identity):

`e506f54aa7c10771c24ccbe91884ef3d9bf9ad79+src-55f4c86347d01ecdc7ee0dcd5ba1b5636ad897bd+run-20260913T180234Z-622`

First official attempt on the same source (`run-20260913T175929Z-99765`) failed desktop interview because `/app/create` painted a blank page (intake textarea never appeared). Mobile interview and both paid-journey choices still passed on that attempt. That run is **not** the official identity.

Official evidence directory (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/e506f54aa7c1-src-55f4c86347d0-live-4188-4189-stub-model-run-20260913T180234Z-622`

Locked scenario is unchanged: Harbor Peak Analytics LLC (Consultant) / Maya Chen + Ironvale Manufacturing Inc. (Client) / Jordan Hale.

## Regression

In `post_signing_ceremony_complete`, the existing `claw_emit_integration_event` pair (`agreement.signed` + `agreement.completed`) sat inside the `else` of `if fully`. Completing only the owner emitted both events with `lifecycle=fully_executed`. Completing the last required signer emitted neither.

The failing production-handler test intercepted `dispatch_webhook_event_async` and forced org resolution through `claw_org_id_for_registered_agreement`. It failed first on owner-only complete (`agreement.signed` + `agreement.completed` present). The correction moved the existing emit block into the `if fully` path, matching `signing-ceremony` documentation and the VS01 `newly_finalized` path. No new event type or dispatcher was added.

## Proof outcomes

`test_ceremony_complete_emits_agreement_completion_only_after_all_required_signers`:

| Case | Outcome |
|---|---|
| Owner-only complete | no `agreement.signed` / `agreement.completed`; one `signature_completed` |
| Replay already-signed owner | `409 already_signed`; still no agreement-level events |
| Rejected last-signer (wrong locked version) | `400`; signature count unchanged; no agreement-level events |
| Last required signer | exactly one `agreement.signed` + one `agreement.completed`; `object_id` and `locked_version_id` match; receipt `status=bound` |
| Owner-header replay after bound completion | `recovered=true`; same `receipt_id`; no additional logical completion events; signature count stays 2 |
| Packet persist fail after last signature | `receipt_pending` / `bound=false`; completion events fire once; retry binds same new receipt identity; no extra events; signature count stays 2 |

Authority/recovery tests remain in the same file and still pass.

## Verification (source frozen after focused proofs)

| Gate | Result |
|---|---|
| Focused pytest `backend/tests/test_core_paid_journey_acceptance.py` | 24 passed |
| Focused vitest (coverage, matrix, review authority, locked version) | 19 passed |
| Official desktop/mobile core gate | 10 passed; `gate_green=True` |
| Phase 4C.2.3 recipient completion truth | PASS |
| Phase 4B.2 recipient-signing browser | PASS (first attempt flaked desktop network-retry load-error; rerun PASS) |
| `frontend` `tsc -b && vite build` | passed |

No full-suite rerun.

## Remaining launch gaps

- Live-model quality is **unproven**. The model boundary remains the acceptance stub. A bounded real-model evaluation is prepared, not executed (`CORE_PAID_JOURNEY_LIVE_MODEL_QUALITY_EVAL_PROPOSAL_2026-09-13.md`).
- Live email, Stripe, staging, Settings/admin, Billing, and sitemap work were not run.
- Date wrapping is still presentation-only.

No launch claim.
