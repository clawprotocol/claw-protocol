# Phase 3B Batch 2.1 checkpoint — frozen legal corpus vs signer metadata

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `e72f1707` (`record phase 3B batch 2 returning-paid persistence checkpoint`)  
Nothing was pushed.

This closes TEST505. It is **not** a launch authorization.

## Invariant

Once a professionally validated accepted corpus is handed off (`commitAcceptedPaidProCorpusHandoffSync`), those exact legal bytes and their hash are immutable. Signer names, titles, emails, notices, and execution state travel as authority / snapshot metadata. Review display may derive an overlay from that metadata. Finalization does not rewrite the frozen legal corpus.

SoT-only working corpora (no validated accepted handoff) still hydrate execution/notice fields into the working body. That is how TEST366 and Alex/PixelForge finalize hydration stay green.

This split is architectural: remember happens on the production accepted-corpus handoff, not on fixture names, hashes, or agreement text.

## TEST505

`signer finalize preserves frozen canonical corpus hash` is closed in isolation: `6/6`.

Hydration now emits the remembered validated accepted body. Snapshot hash matches that body. SoT `prepare` may still rewrite display/SoT bytes; signer finalize does not adopt that rewrite.

## Preservation matrix (inspected together before edit)

| File | Isolated after 2.1 | Notes |
|---|---|---|
| `paidProTest505ReturningPaidStaleUiAndSignerHandoff.test.ts` | **6/6** | closed |
| `paidProTest366PostFinalizeSignerEditCarryover.test.ts` | **3/3** | corrected email still hydrates into the SoT-only working corpus |
| `paidProAlexPixelForgeSignerFinalizeReady.test.ts` | **7/8** | notice/execution hydration still passes. Opening-repair (`does not full-rewrite an already-titled Pro corpus`) failed at `e72f1707` and still fails — not this invariant |
| `paidProNoticeMetadataLabelContamination.test.ts` | **3/4** | contaminated `If to … Attn:` rebuild failed at `e72f1707` and still fails — not this invariant |
| `paidProTest497CompletedCorpusFrozenBody.test.ts` | **0/1** | review-vs-frozen compare failed at `e72f1707` before hydration — not this invariant |
| `paidProBatch21FrozenCorpusSignerMetadata.behavior.test.ts` | **2/2** | new |

## Runtime

- `rememberImmutableFrozenLegalCorpus` stores the exact body at validated accepted handoff.
- `buildHydratedAuthoritativeSigningCorpusFromAuthority` on `finalize_paid_pro_signer_metadata` with signature-region-only and no recital repair emits those bytes when a handoff body exists.
- Identities and `createAuthoritativeSigningSnapshot` signer metadata still update independently.
- `enrichPaidProPostFinalizeDisplayCorpus` remains the presentation overlay (Name/Title on blank execution lines).
- Approved user revisions (`replacePaidProPipelineAcceptedCorpusAfterApprovedRevision`) replace the frozen legal body.

## Verification

### Focused matrix

TEST505 closed. TEST366 preserved. Alex notice/execution hydration preserved. No assertions, snapshots, timeouts, or fail-closed behavior were weakened.

### Paid-journey gate

Added to `frontend/vitest.phase2PaidJourney.runner.config.ts`:

- `paidProTest505ReturningPaidStaleUiAndSignerHandoff.test.ts`
- `paidProBatch21FrozenCorpusSignerMetadata.behavior.test.ts`

### Phase 1 gate

`./scripts/run_phase1_access_contract_gate.sh` — **96/96**.

### Phase 2 paid-journey gate

`./scripts/run_phase2_paid_journey_release_gate.sh` — **63 files, 372 passed**, zero failures.

### Production build

`frontend`: `tsc -b && vite build` succeeded.

### Complete frontend suite

Not rerun. Official baseline remains **9,458 / 9,240 passed / 218 raw** until the next planned full run. Repair stayed inside this corpus/metadata invariant.

## Remaining failures

- TEST505 — closed
- Alex opening-repair, notice label-contamination rebuild, TEST497 review-vs-frozen — pre-existing at `e72f1707`, outside this batch
- Official full-suite raw set unchanged in this checkpoint (no full run)

## What this does not claim

- Launch readiness
- Live model, Stripe, email, or staging
- Closure of TEST497, notice contamination, or Alex opening-title repair
- A full-suite recount
