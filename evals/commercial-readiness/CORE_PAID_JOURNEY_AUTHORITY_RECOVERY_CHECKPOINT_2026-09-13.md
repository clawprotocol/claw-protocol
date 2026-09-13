# Core Paid Journey authority/recovery matrix checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `a02ed76a` (`a02ed76a6a45140ba7c06e983d51048a85197d04`) — Core Paid Journey lock authority and drafted receipt checkpoint  
Nothing was pushed. This is **not** a launch authorization.

The committed Harbor Peak / Ironvale workflow and prior official proofs remain separate and were not combined into this identity:

- Workflow milestone: `80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533+src-9506e8c8b01460dfcb3fd9f24989cb7896a62dcb+run-20260913T040043Z-79629`
- Integrity close: `80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533+src-d20519d460a25751c84125625484cdc87ac1732f+run-20260913T131709Z-88408`
- Authority/receipt close: `a5d9fed737a8563862ea02f94a01b3b717c0c05e+src-d8f4cd00647c2f4a1e0e73a8591154e16c5d6abf+run-20260913T144752Z-92137`

Official authority/recovery proof (one unchanged source identity):

`a02ed76a6a45140ba7c06e983d51048a85197d04+src-495ff7bf1597fb3dd7ce20e86b6d0503df1a6b4b+run-20260913T151340Z-95076`

Official evidence directory (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/a02ed76a6a45-src-495ff7bf1597-live-4188-4189-stub-model-run-20260913T151340Z-95076`

Locked scenario is unchanged: Harbor Peak Analytics LLC (Consultant) / Maya Chen + Ironvale Manufacturing Inc. (Client) / Jordan Hale; $48,000; twelve months from October 1, 2026; Delaware; AI workflow.

## 1. Foreign snapshot associations are rejected

`assert_production_signing_lock_authority` now requires agreement identity consistency across the requested agreement, stored draft, accepted snapshot (`agreementId`), and any present lock `agreement_id`. A valid snapshot for agreement A is not authority for agreement B even when the lock digest matches that snapshot.

Modern missing snapshot identity fails closed (`snapshot_agreement_mismatch`). Uploaded-PDF and `is_pure_legacy_pre_cutover` still skip snapshot bind after identity checks. `PUT /signing-lock` writes `agreement_id` and asserts authority **before** persist.

Negative outcomes (`test_foreign_snapshot_is_rejected_by_isolated_and_production_handlers`):

| Case | Result | State |
|---|---|---|
| Isolated helper: A's snapshot + lock digest called for B | `ok=False`, `snapshot_agreement_mismatch` | N/A |
| Isolated helper: same snapshot called for A | accepted | N/A |
| Production `PUT /signing-lock` on B with planted A snapshot | `400 snapshot_agreement_mismatch` | no lock written |
| Production mint after C's lock rewritten to A's bind + A snapshot planted | `400 snapshot_agreement_mismatch`, no token | no new events |
| Production ceremony complete on that planted C | `400 snapshot_agreement_mismatch` | completion-event count unchanged |

Genuine legacy remains the only allow-without-bind path and is not used to classify malformed modern records.

## 2. Recovery after partial completion persistence

Ceremony complete saves the final signature first, then issues the existing `agreement_finalized` receipt and execution packet. Receipt identity remains `agr_rcpt_{hash(agreement_id, finalized_version_id, network)[:20]}`. `finalized_at` is taken from the existing audit (`signed` / last `signature_completed`), not a new clock.

If the draft is already fully executed, complete is a recovery path (sign token **or** owner). It does not append another `signature_completed` event. Last-signer invite supersede waits until the receipt is **bound**, so the same token can retry. `GET /{id}/proof-status` stays read-only and never calls `TimelineStore.create_receipt`.

Negative/recovery outcomes (`test_receipt_pending_recovers_without_new_signature_or_new_identity`):

| Case | Result |
|---|---|
| Packet persist fails after last signature | `200`, `fully_executed=true`, `finalized_receipt.status=receipt_pending`, `bound=false`; two completion events only |
| GET while pending | `receipt_pending`, no snapshot/participant bindings presented; `create_receipt` not called |
| Retry complete after packet persist restored | `status=bound`, same `agr_rcpt_*` identity, still two completion events |
| Receipt-store create fails after last signature (second agreement) | `receipt_pending`; retry binds; owner-header restart reuses the same `receipt_id` |

No second receipt implementation was added.

## 3. Receipt integrity on read

`verify_drafted_finalized_receipt` reconstructs `build_agreement_receipt_body` from the stored packet + `execution_packet_digest_sha256` and compares the stored commitment. Missing, replaced, or corrupted packet data is not presented as bound evidence. B3 live reads now require `status === "bound"` and `bound === true`.

Negative outcomes (`test_proof_status_fails_closed_on_missing_replaced_or_corrupted_packet`):

| Case | Result |
|---|---|
| Execution packet deleted | GET `receipt_unavailable`, `bound=false`, `receipt_id` retained, no snapshot digest presented |
| Packet `finalizedAt` / completion event timestamp changed | GET `receipt_unavailable`, no required-participant bindings |
| Packet snapshot id + digest replaced | GET `receipt_unavailable`, `bound=false` |
| Packet bytes corrupted | GET `receipt_unavailable` |
| Isolated hash/commitment mismatch | `verify_drafted_finalized_receipt` fails (`receipt_hash_mismatch` or `receipt_unavailable`) |
| Owner recovery after tamper | same `receipt_id` + original accepted snapshot bind, `status=bound` |

## Verification (source frozen after focused proofs)

| Gate | Result |
|---|---|
| Focused pytest `backend/tests/test_core_paid_journey_acceptance.py` | 23 passed |
| Focused vitest (coverage, matrix, review authority, locked version) | 19 passed |
| Official desktop/mobile core gate | 10 passed; `gate_green=True` |
| Phase 4C.2.3 recipient completion truth | PASS |
| Phase 4B.2 recipient-signing browser | PASS |
| `frontend` `tsc -b && vite build` | passed |

## Remaining launch gaps

- Live-model quality is **unproven**. The model boundary remains the acceptance stub.
- Live email, Stripe, staging, Settings/admin, Billing, and sitemap work were not run.
- Date wrapping is still presentation-only.
- Public verify remains a completed-document companion, not immutable receipt evidence.
- Other handler suites outside these gates were not claimed.

No launch claim.
