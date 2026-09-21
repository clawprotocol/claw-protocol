# Core Paid Journey authority and receipt checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `a5d9fed7` (`a5d9fed737a8563862ea02f94a01b3b717c0c05e`) — Core Paid Journey document and receipt integrity checkpoint  
Nothing was pushed. This is **not** a launch authorization.

Earlier official proofs remain separate and were not combined into this identity:

- Workflow milestone: `80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533+src-9506e8c8b01460dfcb3fd9f24989cb7896a62dcb+run-20260913T040043Z-79629`
- Integrity close: `80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533+src-d20519d460a25751c84125625484cdc87ac1732f+run-20260913T131709Z-88408`

Official authority/receipt proof (one unchanged source identity):

`a5d9fed737a8563862ea02f94a01b3b717c0c05e+src-d8f4cd00647c2f4a1e0e73a8591154e16c5d6abf+run-20260913T144752Z-92137`

Focused desktop reproductions (same source; incomplete matrix by design):

`evals/commercial-readiness/results/core-paid-journey-acceptance/a5d9fed737a8-src-d8f4cd00647c-live-4188-4189-stub-model-focused-authority-receipt-run-20260913T144650Z-91721`

Official evidence directory (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/a5d9fed737a8-src-d8f4cd00647c-live-4188-4189-stub-model-run-20260913T144752Z-92137`

Locked scenario is unchanged: Harbor Peak Analytics LLC (Consultant) / Maya Chen + Ironvale Manufacturing Inc. (Client) / Jordan Hale; $48,000; twelve months from October 1, 2026; Delaware; AI workflow.

## 1. Explicit legacy classification and production enforcement

`signPaperAuthorityClosed` no longer treats a missing snapshot id + digest as an implicit legacy path. The frontend uses server-returned `authority_mode` and `legacy_pre_cutover`. Absent classification is modern and fails closed.

Production handlers now call the existing server-authoritative guards:

- modern `PUT /{id}/signing-lock` requires an accepted snapshot and persists that bind
- modern `POST /{id}/recipient-access-token` (sign mode) rejects missing, mismatched, or invalid lock authority before mint
- modern `POST /{id}/signing-ceremony/complete` rejects the same cases before mutation

`is_pure_legacy_pre_cutover` remains the only allow-without-bind path for sealed pre-cutover packets. Malformed modern records with an accepted-snapshot mode or registry history are not classified as legacy.

Production-handler proof (not helper-only):

- modern lock without accepted snapshot: `400 accepted_review_snapshot_required`, no lock written
- modern mint without bind: rejected, no token
- lock snapshot id mismatch / digest mismatch: mint and ceremony reject without completion events
- corrupt accepted corpus: mint rejected; GET still reports `accepted_review_snapshot` / `legacy_pre_cutover=false`
- genuine legacy positive: sealed `vs01` portable packet, no snapshot registry → lock, mint, and owner ceremony continue without snapshot bind

Phase 4B.2 fixtures were modern-corrected (snapshot id + lock bind). They were never genuine legacy and are not labeled as such.

## 2. Public verification is not persisted receipt proof

The drafted ceremony now issues the existing `agreement_finalized` receipt (`create_agreement_receipt_response`) and stores the existing execution-packet artifact. B3 reads `GET /{id}/proof-status` twice after refresh and compares the same receipt to accepted/locked authority.

Required receipt bindings:

- receipt id + `receipt_hash_sha256`
- agreement id
- locked version id
- accepted snapshot id + digest
- exact required participant set
- completion-event participant bindings

Duplicate `signature_completed` events cannot substitute for a missing required signer. Two identical public `/verify` responses are no longer treated as receipt proof. `/view-signed` remains the completed-document view.

## 3. Signing-surface wording

Signing and completed surfaces no longer prepend `Draft Agreement (non-binding template)`. Sign uses `Agreement locked for signature`; completed uses `Completed agreement`. Ordinary draft/review keeps the draft label. Accepted document bytes are not rewritten. Date wrapping remains a presentation-only issue (`date_line_broken`).

## Verification (source frozen after focused proofs)

| Gate | Result |
|---|---|
| Focused pytest `backend/tests/test_core_paid_journey_acceptance.py` | 20 passed |
| Focused desktop Playwright (proposal + direct-sign) | 2 passed; matrix incomplete by design |
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
