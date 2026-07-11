# LawDog Architecture Decision Records

**Status:** Accepted (collection)  
**Parent:** [LawDog System Architecture](./LAWDOG_SYSTEM_ARCHITECTURE.md)  
**Audience:** Engineers, QA, and Cursor agents before modifying create, dashboard, review, signing, or proof flows  
**Last updated:** 2026-07-08

---

## How to use this document

This file records **why** LawDog is shaped the way it is. The root architecture doc describes **how** layers, objects, and markers connect. Read both before changing paid Pro flows.

| Field | Meaning |
|-------|---------|
| **Decision** | The rule we enforce |
| **Rationale** | Why the rule exists |
| **Regression history** | What broke or motivated the rule |
| **Enforcing modules** | Where to look before changing behavior |
| **Related tests** | Executable contracts (`paidProTest*`, `TEST*`); use `TODO / verify` when uncertain |

**Protocol overlap:** ADR-007 aligns with repo-wide [`ADR-002: AI vs proof boundary`](../adr/ADR-002-ai-vs-proof-boundary.md). LawDog ADRs govern **product choreography**; CLAW ADRs govern **proof determinism**.

---

## ADR-001 — Canonical paid Pro freeze is immutable after acceptance

**Status:** Accepted

**Decision:** Once a paid Pro `server_full_draft` is accepted and `PaidProSourceOfTruth` is established, the frozen corpus is the only agreement body the frontend may display, copy, finalize, or send to signing until the user explicitly starts a revision path.

**Rationale:** Ad-hoc edits after acceptance destroy hash parity across review, signing, and proof binding. A single freeze point makes downstream surfaces auditable.

**Regression history:** Pre-freeze churn caused review/sign hash mismatches and “empty Review” surfaces when render sources competed.

**Enforcing modules:** `paidProSourceOfTruth.ts`, `paidProSourceOfTruthState.ts`, `paidProSotEstablishmentGate.ts`, `canonicalAgreementSnapshot.ts`

**Related tests:** TEST392, TEST514, `paidProAuthorityEstablishmentAudit.test.ts`

---

## ADR-002 — Review precedes signing in paid Pro flows

**Status:** Accepted

**Decision:** Paid Pro `createFlowPhase` must reach authoritative review (`draft_ready_for_review`, `AUTHORITATIVE_READY`) before signer setup or signing prep. Delivery-track choice happens on the review surface, not implicitly at generation.

**Rationale:** Users must see and accept the commercial document before committing signer metadata or releasing signing corpus. Skipping review collapses legal UX into a send pipeline.

**Regression history:** Flows that jumped straight to signer setup hid delivery intent and produced signing corpora without an explicit review decision.

**Enforcing modules:** `createFlowTypes.ts`, `enterCanonicalPaidProReviewFlow.ts`, `authoritativeCreateFlowReviewShell.ts`, `paidProStickyCta.ts`, `paidProReviewStateMachine.ts`

**Related tests:** TEST515, TEST570, `paidProAcceptanceRouting.test.ts`

---

## ADR-003 — Dashboard paid-create and first-time post-checkout diverge at entry, converge at freeze

**Status:** Accepted

**Decision:** `dashboard_paid_create` (marker: `claw_paid_dashboard_create_context_v1`) and `post_checkout_apply_success` intentionally differ in entry markers, bootstrap order, and pre-freeze routing. Both must call `planEnterCanonicalPaidProReviewFlow` and converge on the same post-freeze review shell and SoT establishment.

**Rationale:** Dashboard create is entitled rewrite without Stripe return; first-time create carries checkout completion semantics. Forcing one bootstrap path caused marker collisions and wrong recovery routing.

**Regression history:** Direct `/app/create` without dashboard marker routed to generic returning-paid path (TEST543). First-time and dashboard paths disagreed on canonical review entry (TEST515).

**Enforcing modules:** `paidDashboardCreateContext.ts`, `newAgreementSessionReset.ts`, `enterCanonicalPaidProReviewFlow.ts`, `paidProFirstPaidCreateFlowRoute.ts`, `returningPaidCreateBootstrap.ts`

**Related tests:** TEST543, TEST544, TEST545, TEST515, TEST518

---

## ADR-004 — Server-persisted draft is authoritative after persistence; module/session state is not proof

**Status:** Accepted

**Decision:** After create-flow draft persist succeeds, `AgreementDraft` via `agreementWorkspaceApi.ts` is the durable system of record. In-tab SoT, `sessionStorage` markers, and React latches are choreography and render authority only — not proof inputs.

**Rationale:** Tab refresh, multi-device use, and recipient handoff require server-backed identity. Treating session heap as proof would break binding and workspace list truth.

**Regression history:** Workspace rows with `supabase_fallback` exposed cases where client-only state diverged from server draft.

**Enforcing modules:** `agreementWorkspaceApi.ts`, `agreementTypes.ts`, `premiumCompletionStorage.ts`, `paidProSourceOfTruthState.ts`

**Related tests:** TEST521, `paidProTest518DashboardCreateIntakeMetadataPrefill.test.ts` (persist handoff); broader workspace persist — TODO / verify

---

## ADR-005 — VS01 and signing receive frozen authoritative corpus only

**Status:** Accepted

**Decision:** VS01 and recipient signing surfaces consume `AuthoritativeSigningSnapshot` or equivalently gated signing corpus — never working draft, pipeline preview, or starter output. Corpus must meet minimum length and boundary gates before signing packet render.

**Rationale:** Sign packets bind to a frozen hash. Feeding mutable or preview text into signing invalidates attestation and recipient trust.

**Regression history:** Thin or fallback preview corpora produced empty or sub-minimum signing packets (`vs01CorpusGate.test59`).

**Enforcing modules:** `authoritativeSigningSnapshot.ts`, `vs01/vs01CorpusGate.ts`, `paidProSignerSigningCorpusHygiene.ts`, `vs01PaidProPostSignHandoff.ts`

**Related tests:** `vs01CorpusGate.test59.test.ts`, TEST322, Test365, TEST514

---

## ADR-006 — Starter/free output must never feed paid proof, signing, or authoritative review

**Status:** Accepted

**Decision:** Free starter sessions (`claw_free_starter_session_v1`) and starter review shells are isolated from paid authoritative render. Post-checkout paid surfaces route to `FAILED_PREMIUM_CORPUS` recovery — never silent degrade to starter.

**Rationale:** Paid users paid for authoritative output; starter preview is a different product tier with different quality gates and no proof binding.

**Regression history:** Post-checkout validation failures incorrectly reopened starter chrome, hiding recovery and corrupting paid corpus selection.

**Enforcing modules:** `paidProReviewStateMachine.ts`, `freeStarterReviewShell.ts`, `paidProSessionEligibility.ts`, `paidProPostCheckoutRenderGate.ts`

**Related tests:** `paidProReviewStateMachine.test.ts`, `paidProAcceptanceRouting.test.ts`, TEST506, TEST521

---

## ADR-007 — LLM output enters proof/signing only through explicit validated generation/freeze gates

**Status:** Accepted

**Decision:** Model-generated text may influence drafting only before SoT establishment. After freeze, no LLM provider or non-deterministic normalization may alter corpus used for review authority, signing snapshot, or proof paths. Generation must pass `premium_full_draft` quality gate and `paidProCorpusAcceptance` before freeze.

**Rationale:** Proof integrity cannot depend on model behavior (see ADR-002 repo-wide). Freeze gates are the contractual boundary.

**Regression history:** Duplicate generation audit entries short-circuited network calls and starved corpus selection, yielding empty Review (TEST552). Mis-scoped audit allowed `fallback_preview` to masquerade as authoritative.

**Enforcing modules:** `premiumCompletionPipeline.ts`, `paidProPremiumGenerationCallAudit.ts`, `paidProCorpusAcceptance.ts`, `backend/agreements/premium_full_draft_quality_gate.py`, `paidProSotEstablishmentGate.ts`

**Related tests:** TEST552, TEST561, `paidProAuthorityEstablishmentAudit.test.ts`

---

## ADR-008 — Signer identity and party legal entity identity are separate

**Status:** Accepted

**Decision:** Party slots hold legal entity identity (name, role, notice address). Signer metadata (human name, title, email) lives in dedicated signer authority and must never be inferred from party entity name or contaminate party slots.

**Rationale:** LLCs and corporations sign through authorized humans; conflating entity and signer breaks execution blocks, notice stanzas, and N-party render token assignment.

**Regression history:** Legal-form appositives promoted phantom parties (TEST550). Signer-slot contamination shifted party indices and dropped parties from notice/execution blocks.

**Enforcing modules:** `signerSetupPartyIdentity.ts`, `paidProSignerMetadataAuthority.ts`, `partySlotIdentityNormalize.ts`, `paidProPartyNamePreserve.ts`

**Related tests:** TEST550, TEST547, `signer-slot-contamination-blocked` telemetry in `signerSetupPartyIdentity.ts`

---

## ADR-009 — Signer metadata changes use dedicated paths and must not mutate frozen canonical corpus

**Status:** Accepted

**Decision:** Signer edits flow through signer setup, `paidProSignerMetadataAuthority`, and finalize into `AuthoritativeSigningSnapshot`. They must not rewrite the frozen canonical SoT body except through allowed post-finalize hydration paths audited by corpus lifecycle diff.

**Rationale:** Treating signer typing as draft editing would violate SoT immutability and trigger false parity failures or silent corpus drift.

**Regression history:** Transient recompute during signer typing triggered `FAILED_PREMIUM_CORPUS` downgrade; `signerMetadataEditActive` was added to hold authoritative state during edit.

**Enforcing modules:** `authoritativeSigningSnapshot.ts`, `paidProSignerMetadataAuthority.ts`, `paidProSignerMetadataCommitPolicy.ts`, `hydratePaidProExecutionBlockWithSignerMetadata.ts`, `paidProReviewStateMachine.ts`

**Related tests:** `paidProReviewStateMachine.test.ts` (signer-typing isolation), TEST575, TEST576, `paidProPostFinalizeEditSignerDetails.test.tsx`

---

## ADR-010 — Notice/address hydration is allowed only when classified as notice/contact hydration

**Status:** Accepted

**Decision:** Threading party street addresses or notice contact fields into Notices stanzas after signer finalize is permitted only when `classifyPaidProCorpusLifecycleDiff` returns `notice_contact_hydration_only`. It is not a substantive clause change.

**Rationale:** Notices must reflect operable contact details for delivery; identical operative clauses with hydrated notice fields should not fail parity or block signing prep.

**Regression history:** Post-finalize notice threading changed snapshot hash relative to frozen SoT; unclassified delta was misread as substantive drift (TEST576). Notice authority repairs required confined stanza edits (TEST542, TEST546).

**Enforcing modules:** `paidProCorpusLifecycleDiff.ts`, `paidProPartyNoticeDetails.ts`, `paidProNoticeContactAuthority.ts`, `paidProReviewSotParity.ts`

**Related tests:** TEST576, TEST542, TEST546, TEST575

---

## ADR-011 — Review-render parity fails closed unless delta is explicitly classified as allowed

**Status:** Accepted

**Decision:** `auditPaidProReviewRenderSotParity` compares canonical freeze hash to review render plain text. Mismatches are violations unless classification is in the allowed set (`notice_contact_hydration_only`, `signer_metadata_only`, `execution_block_hydration_only`, `display_normalization_only`, `whitespace_or_line_width_only`, `identical`).

**Rationale:** Silent render drift is how “looks fine in review, wrong on sign” bugs enter production. Unclassified deltas must surface, not auto-forgive.

**Regression history:** Unresolved render tokens and display-normalization leaks bypassed parity until explicit allow-list enforcement (TEST563, TEST551).

**Enforcing modules:** `paidProReviewSotParity.ts`, `paidProCorpusLifecycleDiff.ts`, `userVisibleRenderTokenAuthority.ts`, `paidProDocumentBoundaryAuthority.ts`

**Related tests:** TEST576, TEST563, TEST551, TEST392, TEST541

---

## ADR-012 — Dashboard paid-create requires explicit delivery-track intent before signer setup

**Status:** Accepted

**Decision:** On `dashboard_paid_create`, the forced first-review track chooser must appear before `paidProInlineSignerSetupLatched` arms. `shouldArmPaidProFirstReviewSignerSetupLatch` stays false until the user explicitly chooses a delivery track (default review; signature only on explicit pick).

**Rationale:** Auto-mounting signer setup before delivery choice hides the review-vs-signature product decision and routes users into metadata forms without accepting the document path.

**Regression history:** Dashboard paid-create mounted inline signer setup immediately post-freeze, skipping the review decision surface (TEST570).

**Enforcing modules:** `signerSetupPartyIdentity.ts`, `proDeliveryTrackState.ts`, `PaidProForcedFirstReviewChrome.tsx`, `AgreementBuilderIntake.tsx`

**Related tests:** TEST570

---

## ADR-013 — Signature-track intent must survive signer confirmation and finalize

**Status:** Accepted

**Decision:** When the user picks the signature delivery track (“Prepare for signing”), `paidProSignaturePrepIntentLatched` pins `proDeliveryTrackSelected` to `"signature"` through inline signer setup even when `signaturePreparationRequested` is deliberately held false for form mounting.

**Rationale:** `effectivePremiumSendMode` review-first default reasserted during signer setup and collapsed explicit signature choice, looping users back to review decision (TEST577 root cause).

**Regression history:** Dashboard paid-create: “Prepare for signing” set `selectedTrack:'signature'` then reverted to `'review'` after signer setup mounted.

**Enforcing modules:** `proDeliveryTrackState.ts` (`resolveProDeliveryTrackSelected`, `paidProReviewDefaultsToReviewTrack`), `AgreementBuilderIntake.tsx`

**Related tests:** TEST577, TEST575

---

## ADR-014 — Finalized signer metadata latch prevents re-arm loops from transient churn

**Status:** Accepted

**Decision:** After signer finalize succeeds, `paidProSignerMetadataFinalizedLatch` (and sticky CTA phase `signer_details_complete` → `prepare_signing`) blocks re-arming inline signer setup unless the user explicitly clicks “Edit signer details”. Stale `paidProInlineSignerSetupLatched` must not reopen setup post-finalize.

**Rationale:** Transient module-state recompute (parity flip, empty-body moment, render-source churn) re-armed signer forms and trapped users in setup loops instead of advancing to signing prep.

**Regression history:** Post-finalize flows re-opened signer setup on “Prepare for signing” (TEST575). Stale inline latch re-armed after notice hydration (TEST576).

**Enforcing modules:** `paidProStickyCta.ts`, `signerSetupPartyIdentity.ts`, `authoritativeSigningSnapshot.ts`, `AgreementBuilderIntake.tsx`

**Related tests:** TEST575, TEST576, `paidProPostFinalizeEditSignerDetails.test.tsx`

---

## ADR-015 — Session markers have owners; write and clear only from owning flow

**Status:** Accepted

**Decision:** Each `sessionStorage` marker in §5 of the root architecture doc has a single owning flow responsible for write, scoped read, and clear on cross-flow entry. Foreign flows must not set or retain another flow’s marker (e.g. homepage clears `claw_paid_dashboard_create_context_v1`).

**Rationale:** Marker leakage routes users into wrong bootstrap, recovery, and entitlement paths — especially dashboard vs direct create vs checkout return.

**Regression history:** Missing dashboard marker caused continuous fail-closed telemetry and off-canonical routing (TEST543). Fatal marker timing before bootstrap completed produced false fatals (TEST545). Entitlement marker triad collisions (`pro_intent`, `pro_entitlement`, `free_starter`).

**Enforcing modules:** `paidDashboardCreateContext.ts`, `newAgreementSessionReset.ts`, `premiumCompletionStorage.ts`, `paidProSessionEligibility.ts`, `agreementIntakeStorage.ts`

**Related tests:** TEST543, TEST544, TEST545, `paidProSessionEligibility` (module tests if present — TODO / verify)

---

## ADR-016 — Admin and ops surfaces are read/telemetry paths, not agreement-creation source of truth

**Status:** Accepted

**Decision:** L6 routes (`/app/admin`, `/founder`, `/app/ops/*`) provide operator visibility, configuration, and telemetry. They do not establish `PaidProSourceOfTruth`, arm create-flow phases, or substitute for `/app/create` choreography.

**Rationale:** Mixing ops tooling into create state machines creates non-reproducible user paths and bypasses entitlement and marker ownership rules.

**Regression history:** No single regression test owns this boundary; it is architectural separation from paid-create FSM (root architecture L6).

**Enforcing modules:** `AppShell.tsx` route table, admin/ops page modules under `frontend/src/launch/` and ops routes; create isolation via `AgreementBuilderIntake.tsx`

**Related tests:** TODO / verify (no dedicated `paidProTest*` identified; enforce via route-layer review)

---

## ADR-017 — Recipient review and signing are downstream handoffs; they do not reinterpret create-flow SoT

**Status:** Accepted

**Decision:** `/review/:id` and `/sign/:id` consume token-scoped server state and frozen handoff corpora. Recipient surfaces must not re-derive agreement text from intake, starter preview, or in-tab module state from the creator’s session.

**Rationale:** Recipients lack creator session context. Reinterpretation would show different text than the creator finalized and break proof binding across parties.

**Regression history:** Cross-surface hash identity regressions when handoff used a different render source than canonical SoT (TEST514). VS01 bridge required explicit post-sign handoff marker consumption.

**Enforcing modules:** `recipientAccessApi.ts`, `canonicalAgreementSnapshot.ts` (`readCanonicalAgreementCorpusForSurface`), `vs01PaidProPostSignHandoff.ts`, `agreementWorkspaceApi.ts`

**Related tests:** TEST514, `vs01PaidProPostSignHandoff` tests, `docs/qa/LAWDOG_UNIVERSAL_REVIEW_INTAKE_QA.md` (manual recipient QA)

---

## ADR-018 — Diagnostic invariants may log without blocking; blocking invariants must fail closed

**Status:** Accepted

**Decision:** Telemetry and diagnostic predicates (e.g. `logPaidProReviewSotParity`, `resolveCanonicalSnapshotDiagnosticIntegrity`, section-structure diagnostics) may record `invariantOk: false` without halting UX when explicitly classified as diagnostic. Authority gates that protect freeze, boundary, paid routing, and empty authoritative render must fail closed — throw, block render, or route to `FAILED_PREMIUM_CORPUS` — never silently continue.

**Rationale:** Over-blocking on diagnostics causes false fatal loops during transient recompute; under-blocking on authority gates ships empty or wrong corpora to paid users.

**Regression history:** Parity logs were added as diagnostics without blocking review (by design). Conversely, missing fail-closed on post-checkout empty corpus produced starter-like empty Review (TEST552). `blockOnViolation` on document boundary freeze path enforces hard stops (TEST392, TEST563).

**Enforcing modules:** `paidProReviewSotParity.ts`, `canonicalAgreementSnapshot.ts`, `paidProDocumentBoundaryAuthority.ts`, `paidProReviewStateMachine.ts`, `paidProPostCheckoutRenderGate.ts`, `sectionStructureAuthority.ts`

**Related tests:** `canonicalAgreementSnapshot.test.ts`, TEST552, TEST392, TEST563, `paidProReviewStateMachine.test.ts`

---

## Index of decisions

| ADR | Title |
|-----|-------|
| 001 | Canonical paid Pro freeze immutable after acceptance |
| 002 | Review precedes signing in paid Pro flows |
| 003 | Dashboard vs first-time create diverge at entry, converge at freeze |
| 004 | Server draft authoritative after persist; session state not proof |
| 005 | VS01/signing receives frozen authoritative corpus only |
| 006 | Starter/free never feeds paid proof or authoritative review |
| 007 | LLM output only through validated generation/freeze gates |
| 008 | Signer identity separate from party legal entity |
| 009 | Signer metadata via dedicated paths; no silent SoT mutation |
| 010 | Notice/address hydration allowed only when classified |
| 011 | Review-render parity fails closed unless delta allowed |
| 012 | Dashboard paid-create: explicit delivery track before signer setup |
| 013 | Signature-track intent survives signer setup/finalize |
| 014 | Finalized signer metadata latch prevents re-arm loops |
| 015 | Session markers have owning flows |
| 016 | Admin/ops are not create-flow SoT |
| 017 | Recipient flows are downstream handoffs |
| 018 | Diagnostic log vs blocking fail-closed split |
| 019 | Paid Pro execution normalization authority at acceptance |
| 020 | Paid Pro frozen SoT display-surface corpus parity |

---

## ADR-020 — Frozen SoT display projection must not hydrate substantive content

**Status:** Accepted (2026-07-11)

**Decision:** After freeze, `projectPaidProFrozenSoTDisplayPlain` is the sole authorized presentation projection for paid review surfaces. It may apply deterministic line breaks, title/heading splits, witness blank-line separation, and collapsed-notice line expansion. It must **not** call `ensureOperativeIfToNoticeDelivery`, `repairBareEntityOnlyNoticeStanzas`, or other substantive notice/execution repair at display time.

**Semantic parity:** `legalTokenFingerprint(review) === legalTokenFingerprint(frozenSoT)` and byte equality when the frozen corpus is already display-ready (TEST336, TEST587).

**Surface parity:** Review, copy, and signer-setup surfaces consume `projectPaidProFrozenSoTDisplayPlain(frozenSoT)` via `resolvePaidProAuthoritativeDisplayPlain` / `resolvePaidProReviewRenderPlain`.

**Persistence boundary:** Display projection never writes back to `PaidProSourceOfTruth`.

**Enforcing modules:** `paidProDisplayPlainAuthority.ts` (`projectPaidProFrozenSoTDisplayPlain`), `paidProFlattenedDocumentNormalize.ts` (`preparePaidProFrozenDisplayPlain`)

**Related tests:** TEST587, TEST336 lifecycle, TEST402, TEST586-L

### Paid Pro capability matrix (2026-07-11, post display-parity)

| Capability | Status |
|------------|--------|
| Entity authority | Frozen |
| Notice authority | Frozen |
| Party metadata authority | Frozen |
| Section hierarchy authority | Frozen |
| Section sequencing policy | Frozen |
| Execution normalization authority | Frozen |
| Frozen SoT corpus authority | Active — display derives from frozen SoT only |
| Display-surface parity | Active — TEST587 green; byte/token parity proven |
| Signature lifecycle | Unchanged |
| TEST552 recovery path | Active — TEST588 green |
| Generation-attempt authority | Active — ADR-021 |
| Supersession authority | Active — ADR-022 |
| Accepted-corpus integrity | Active — ADR-022 |
| Test250 synthetic-heading path | Separate capability |

---

## ADR-021 — Paid Pro generation-attempt authority isolates classification per checkout generation

**Status:** Accepted (2026-07-11)

**Decision:** Every Paid Pro checkout generation establishes a unique attempt identity (`agreementGenerationId` + intake fingerprint). Current-attempt classification must use that attempt's HTTP wire corpus and validation evidence — not pre-gate display-prep mutations, prior-attempt recovery latches, or process-global audit ledgers.

**Evidence scoping:** `resolveCurrentAttemptPremiumValidationCorpus` validates from the immutable wire body when display-prep altered the processed doc. When wire professional clause coverage passes for an authoritative server pipeline source, freeze/safe-display prep must not reject on prepared-body professional or minimum-substance gates alone.

**Reset rule:** `beginPaidProGenerationAttempt` initializes attempt-scoped recovery state at generation start.

**Late-result rule:** Superseded attempt IDs cannot write authoritative recovery state.

**Enforcing modules:** `paidProGenerationAttemptAuthority.ts`, `premiumCompletionPipeline.ts`, `paidProCorpusAcceptance.ts`

**Related tests:** TEST552, TEST588, TEST589

---

## ADR-022 — Paid Pro accepted-corpus integrity requires preservation proof before freeze

**Status:** Accepted (2026-07-11)

**Decision:** Wire-authoritative validation may prevent false rejection caused solely by display-prep or classifier visibility differences. It must not authorize freeze when the freeze candidate lost substantive content that wire evidence proved present.

**Preservation requirement:** Before acceptance/freeze, `assessPaidProAcceptedCorpusPreservationProof` compares wire-authorizing professional topics and minimum-substance markers against the freeze candidate using stable material-evidence probes.

**Forbidden bypass:** `wire passes → prepared fails → freeze without preservation proof`.

**Valid model:** `wire passes → prepared classifier false negative → preservation proof passes → accept/freeze`.

**Supersession requirement:** Every authoritative generation write (`adoption`, `session_freeze`, `pipeline_validation_acceptance`, `pipeline_outcome`) must pass `guardPaidProAuthoritativeWrite` with current attempt sequence identity.

**Enforcing modules:** `paidProAcceptedCorpusIntegrity.ts`, `paidProAuthoritativeWriteGuard.ts`, `paidProGenerationAttemptAuthority.ts`, `paidProCorpusAcceptance.ts`, `premiumCompletionPipeline.ts`

**Related tests:** TEST589

---

## ADR-019 — Paid Pro execution normalization removes stale pre-witness tails before early return

**Status:** Accepted (2026-07-11)

**Decision:** `ensurePaidProAcceptanceExecutionBlockInvariant` must classify and remove stale execution-tail material (inline `SIGNATURES` blocks, duplicate witness headings, incomplete By/Name/Title sequences) *before* the canonical-block early return. A valid witness count of 1 does not prove the corpus is free of stale execution pollution.

**Preservation boundary:** Only positively classified stale execution material may be removed. Substantive clauses, notices, counterparts, and the single canonical execution block must not be deleted.

**Idempotence:** `removeStalePreWitnessExecutionTail(normalize(doc)) === normalize(doc)` for accepted corpora.

**Out of scope (separate capabilities):** TEST552 generation-audit recovery path; Test250 synthetic-heading SoT establishment.

**Enforcing modules:** `paidProAcceptanceExecutionBlockInvariant.ts` (`removeStalePreWitnessExecutionTail`, `hasPreWitnessStaleExecutionMaterial`)

**Related tests:** TEST586, TEST336 execution invariant assertion, `paidProAcceptanceExecutionBlockInvariant.test.ts`

---

## Revision history

| Date | Change |
|------|--------|
| 2026-07-08 | Initial 18 ADRs for LawDog product architecture |
| 2026-07-11 | ADR-019 execution normalization; ADR-020 display-surface parity; ADR-021 generation-attempt authority |
