# Phase 3B Batch 4 checkpoint — paid dashboard reopen and resume continuity

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `e606795b` (`record phase 3B batch 3 authoritative first-review checkpoint`)  
Nothing was pushed.

This closes dashboard reopen / resume continuity for a paid owner. It is **not** a launch authorization. Live Stripe, model, email, and staging were not run.

## Controlling contract

1. Resume uses authenticated, owner-scoped server state for the exact durable agreement ID.
2. A verified pending snapshot may paint review. Accepted authority is required for finalize / send / sign.
3. Post-finalize display is the verified frozen body plus server-persisted signer metadata. Module state, browser storage, or a pinned local corpus cannot authorize resume.
4. GET / persist failure produces a paid retry state. It must not paint an unverified local “finalized” corpus.
5. Frozen operative bytes remain unchanged. Signer presentation is execution-tail metadata only.
6. Logout, organization switch, or agreement mismatch invalidates resume state.

## Runtime

Shared selector: `frontend/src/components/agreements/paidProDashboardResumeAuthoritySelection.ts`

- `classifyDashboardResumeAuthority` / `selectDashboardResumePaint` / `canPaintDashboardResumePaper` / `canEnableDashboardResumeCommercialActions`
- Resume paper mounts only from `readVerifiedCommercialDisplayCorpus` / `hasVerifiedCommercialDisplayCorpus`
- Local SoT, pipeline, pinned corpus, and review-session authority do not authorize resume
- Resume surface requires a matching durable agreement ID (URL / session arm / stored resume id). A leftover arm without that ID cannot steal first-review paint.

Delivery track: `frontend/src/components/agreements/paidProOwnerDeliveryTrack.ts` plus the smallest owner-scoped field `owner_delivery_track` (`review` | `signature`) on `AgreementDraft`. Other-org / unsigned writes stay 403/404/401.

Title chrome: `resolvePaidProDisplayTitleChrome` renders a deterministic `h1` from draft / intake / family when frozen bytes have no title block. Inferred title is not written back into the corpus.

TEST517: a professionally long degraded `json_parse` `document_text` stays server-origin authority (`server_full_draft_degraded`). Exact wire body/length is preserved. `postPremiumFullDraftOnce` is not called.

Signer restore: intake-prefilled names / titles / emails / addresses align by legal-entity index. Entity stems are not signer names. Informal human party names such as `Mike` are not scrubbed. Confirmation is still required.

## Targeted identities

| Identity | Isolated | Notes |
|---|---|---|
| Dashboard FinalReviewPaint | **5/5** | Fail-closed without verified GET. Positive verified-GET paints frozen body + server signer metadata. |
| Dashboard PreviewPaint | **6/6** | Pipeline / session corpus cannot authorize resume paper. Title chrome from draft/intake when frozen bytes have no title. React import is harness-only. |
| TEST412 | **7/7** | Quad-party intake humans seed by entity index. Names are not legal entities. Blank names are not complete. |
| TEST517 | **5/5** | Exact ≥10,464 `document_text`; `server_full_draft*`; one generation call. |
| TEST518 | **5/5** | Manifest entities/addresses hydrate. Signer-name slots stay empty. |
| TEST570 | **13/13** | Source-window 4,200 assertion removed. Prepare mounts signer setup only after the delivery decision. |

Focused dashboard matrix: **6 files, 41/41** (was 40 tests / 28 passed / 12 failed at the stated baseline; +1 fail-closed / verified-GET case).

## Test-contract corrections

| File | Legacy assertion | Why it was corrected |
|---|---|---|
| FinalReviewPaint | Paint post-finalize local corpus before verified GET | Contradicts fail-closed resume. Replaced by unpaid-GET retry plus a verified-GET positive. |
| PreviewPaint | Missing `h1` / space-padded store | Verified store requires trimmed length == `corpusLength`. Title chrome is display-only. `import React` is harness-only. |
| TEST570 | Fixed 4,200-character source window for `setPaidProInlineSignerSetupLatched(true)` | Handler grew. Replaced by behavioral latch / chooser proof. |
| TEST412 | `gate.complete` without proving humans ≠ entities | Prefill must populate Joe/Mary/Hen/Ira and still require confirmation. |
| TEST517 | Winning 0 / `rejected_paid_corpus` / second POST | Substantive degraded `document_text` is server authority. |

## Paid-journey gate additions

Added to `frontend/vitest.phase2PaidJourney.runner.config.ts`:

- `paidProDashboardSignerSetupResumeFinalReviewPaint.test.tsx`
- `paidProDashboardSignerSetupResumePreviewPaint.test.tsx`
- `paidProTest412IntakeSignerMetadataPrefill.test.ts`
- `paidProTest517ServerDocumentTextAlias.test.ts`
- `paidProTest518DashboardCreateIntakeMetadataPrefill.test.ts`
- `paidProTest570DashboardReviewDecisionFlow.test.ts`

## Verification

- Focused dashboard matrix: **6 files, 41 passed**, zero failures
- Phase 1: **96/96**
- Phase 2 paid-journey frontend: **86 files, 516 passed**, zero failures (was 80 / 475)
- Backend ownership / agreement-ID / snapshot / org-switch / `owner_delivery_track`: passed (Phase 2 critical backend plus `test_owner_delivery_track_auth`, `test_agreement_read_scope`, `test_workspace_index_subject_scoped`, `test_auth_identity_enforcement`)
- Production build: `frontend` `tsc -b && vite build` succeeded
- Complete frontend suite (exactly once):

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase3b-batch4/frontend-full.json
```

Duration: 465.4s.

| Check | Official baseline | This run |
|---|---:|---:|
| Inventory | 9,471 | 9,475 |
| Passed | 9,262 | 9,275 |
| Raw failed assertions | 209 | 200 |
| Failed suites | 353 | 349 |

Inventory +4 is from added dashboard / TEST570 behavioral cases.

## Official remainder (compare to 9,471 / 9,262 / 209)

Batch 4 identities that left the official raw set and stay isolated-green:

- TEST412 production prefill
- TEST517 (2)
- TEST518 (2)
- TEST570 source-window row (replaced by behavioral proof)
- Dashboard FinalReviewPaint / PreviewPaint fail-closed + title rows

Do **not** subtract the rest of the 40 “left official raw set” rows as this-batch closures. This is the first official full-suite rerun since Batch 3 / 2.2.1. Those leftover exits include after-pay / hash-parity / TEST406 / TEST464 / TEST221 / TEST225 / TEST243 / TEST338 and similar first-rerun exits.

New in this raw set (31) — **not repaired** in this batch:

- Recovery / SoT-commit cluster now fail-closed (`paidProPostCheckoutRecoveryAuthority`, TEST209, TEST244, TEST480–486, network retry)
- Brand-licensing / json_parse flaps (TEST434 / 437 / 446–454 / 452)
- TEST289 authoritative-document paint (`authoritativeAgreementDocument` is not a dashboard-resume source)
- TEST400 / TEST413 / TEST430 / TEST577 latch window / first-Pro Mike seed / notice-hydration / VS01 corpus
- Other order-dependent rows already classified as flaps in Batch 2.2

After the official once-run, isolated confirmation showed two Batch 4 self-regressions (human party name `Mike` scrubbed as an entity; TEST577 latch line pushed out of a source window by `persistOwnerDeliveryTrack`). Those were corrected locally. Resume also requires a matching agreement ID so a leftover arm cannot steal first-review paint. The official suite was **not** rerun after those corrections.

## Preservation

- Batch 2.2.1 accepted-snapshot requirement: pending GET still cannot freeze / finalize
- Batch 3 after-pay selector and recovery-cannot-seed-SoT remain
- Frozen operative bytes unchanged; signer overlay is execution-tail metadata only
- Phase 1 access policy: **96/96**
- Wrong-account, signed-out, free-user, and stale-browser failures remain closed

## Remaining (not this batch)

- **No launch-readiness claim**
- TEST511 and other leftovers, hash-parity, source-window / `json_parse` flaps, suite-load
- TEST341 remains in the official remainder from earlier batches
- Official raw remainder is **200**, not a cleaned launch set
- Live model, Stripe, email, and staging were not run
