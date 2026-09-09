# Phase 3A commercial-launch failure triage — 2026-09-09

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase2-integrated`  
HEAD at suite start: `0044a339` (`record phase 2 integrated checkpoint`)  
Nothing was pushed. Production code, tests, assertions, snapshots, and timeouts were not changed.

This is classification and a repair plan only. It is **not** a launch authorization.

## Objective

Establish the post-TEST577 full-suite baseline and classify every persistent failure so Phase 3B can repair paid-user authenticated screens first: create → review → send → sign → receipt.

## Baseline command (run once)

```bash
cd frontend && npx vitest run --reporter=json --outputFile=/tmp/phase3a-triage/frontend-full.json
```

Duration: 365.9s. The complete frontend suite was not rerun.

## Post-TEST577 counts

| Check | Phase 1 (`acdf450f`) | Phase 2 integrated (pre-TEST577 fix) | Phase 3A baseline (`0044a339`) |
|---|---:|---:|---:|
| Frontend inventory | 9,423 | 9,445 | 9,445 |
| Passed | 9,178 | 9,209 | 9,210 |
| Raw failed assertions | 245 | 236 | 235 |
| Failed suites | 410 | 392 | 390 |
| Suite-load `source` files | 14 | 14 | 14 |
| Load-only timeouts in the raw set | 4 | 1 (`TEST486`) | 1 (`TEST486` at 5.1s) |
| Persistent failed assertions | 241 | 235 including TEST577 | **234** |

TEST577 is green on this HEAD (latch-first order from `a67069c6`). The seven Phase 0 brand-licensing / dashboard-pipeline identities that passed in the Phase 2 integrated run remain gone. `TEST486` still fails only under full-suite load; Phase 2 isolated it at 4/4.

Classified identities below include the 235 raw assertion failures plus the 14 suite-load files (**249** rows). Persistent commercial debt for repair planning is **234** assertion failures after removing `TEST486`.

## Classification rules

Each identity gets one primary bucket:

1. **timeout/load-only** — suite failed before collecting tests (`reading 'source'`), or the Phase 1 timeout-only identity (`TEST486`).
2. **authentication/access/security blocker** — entitlement, session bootstrap, draft-limit fail-closed, or checkout settlement / Stripe boundary.
3. **paid-user launch blocker** — a paid owner or post-checkout customer would see the wrong shell, a starter document, missing signers, a dead-end create, a dashboard resume miss, or a completed artifact that does not match the frozen agreement.
4. **document/signing/recovery blocker** — corpus hash, notices, headings, degraded `json_parse` recovery, execution-block, or SoT freeze quality that is not itself the sitemap entry/exit.
5. **unrelated product area** — Free Starter, live-draft preview, guided Q&A, Harbor demo, upsell copy, refine CTA.
6. **obsolete or brittle evaluation/source-inspection test** — `readFileSync` wiring contracts, GTM/eval scoring, mutation-trace / RC diagnostics, telemetry source locks.

Overlapping names were assigned by customer-visible sitemap impact first. Several launch-blocker files also use source inspection; they stay in the launch bucket because the failing contract is the paid journey.

## Classification totals

| Bucket | Identities |
|---|---:|
| paid-user launch blocker | 38 |
| authentication/access/security blocker | 6 |
| document/signing/recovery blocker | 129 |
| unrelated product area | 33 |
| obsolete or brittle evaluation/source-inspection test | 28 |
| timeout/load-only | 15 |
| **Total classified** | **249** |

The Phase 2 paid-journey gate remains green and is outside this inventory. These 38 launch blockers live in tests the gate does not run.

## Isolated reproducibility (launch + auth only)

One focused rerun of the 34 launch/auth files — not the complete suite:

```bash
# 30 paid-user launch files + 4 auth/security files
cd frontend && npx vitest run --reporter=json --outputFile=/tmp/phase3a-triage/launch-isolated.json \
  src/components/agreements/paidProTest490CreateFlowRouting.test.ts \
  # ... remaining 33 files listed in /tmp/phase3a-triage/classified.json
```

Result: **226 tests / 182 passed / 44 failed**. All **44** launch + auth identities from the full suite failed again. None were suite-contention flakes.

## Launch-blocking failures

Customer-visible paid screens. Isolated: **reproduced** for every row.

### Create lands on Free Starter / starter shell

| Identity | Route | User | Customer-visible consequence |
|---|---|---|---|
| TEST490 paid create must not route into Free Starter | `/app/create` | Returning or entitled paid owner | Submit stays on the free-starter review path instead of paid Pro review. |
| TEST492 workspace pro skips free-starter latch when React tier is stale | `/app/create` | Paid owner with workspace Pro and stale free UI tier | Local parse + pipeline acceptance still latches Free Starter. |
| TEST500 returning paid dead-ends on starter-shell validation | `/app/create` | Returning paid owner | Final review keeps a starter-length body; create cannot continue. |
| TEST508 `guided_continue` must await entitlement before starter gate | `/app/create` | Provisionally paid / guided-continue owner | Four-party continue hits the starter gate before entitlement resolves. |
| TEST502-2 workspace-pro user resolves `paid_pro` shell, not `free_starter` | `/app/create` | Returning paid owner | Shell classification is Free Starter after a paid workspace bind. |

### First-time checkout and returning create must share one review entry

| Identity | Route | User | Customer-visible consequence |
|---|---|---|---|
| TEST501-2 post-checkout and returning plans share review mount flags | `/app/checkout/:id` → `/app/create` | First-time paid after checkout; returning paid | Two different review UIs; returning create does not reuse the post-pay path. |
| TEST501-5 / TEST503-4 / TEST504-7 Sarah Mitchell / Michael Torres hydration | `/app/create` review | Returning paid owner | Review bullets show Red Mesa / Harbor Peak (or entity names) instead of the intended signers. |
| TEST502-6 accepted corpus enables canonical entry with signer hydration | `/app/create` | Returning paid owner | Accepted paid body does not open the canonical review+signer entry. |
| TEST504-6 intake wires synchronous corpus handoff | `/app/create` | Returning paid owner | Source contract: accepted Pro body is not committed before review mount. |
| TEST505-1 first-time post-checkout plan unchanged | `/app/checkout/:id` | First-time paid owner | First-time plan expected Sarah/Michael; got Red Mesa entities. |
| TEST505-2 signer finalize preserves frozen hash | `/app/create` | Returning paid owner | Finalize rewrites the frozen corpus (`10225:5f1d9f2b` vs `10098:4de97af0`). |
| TEST506 first-time and returning share canonical plan | `/app/create`, `/app/checkout/:id` | First-time and returning paid | Returning create diverges from the post-payment plan. |

### After-pay first review is blank, starter, or wrong document

| Identity | Route | User | Customer-visible consequence |
|---|---|---|---|
| TEST221 no legacy starter shell after degraded recovery | `/app/checkout/:id` → review | First-time paid after pay | First review can still show starter/legacy chrome. |
| TEST225 payment → first review retry path | `/app/checkout/:id` | First-time paid after pay | Structural retry does not return `server_full_draft_retry`; review can stall. |
| TEST243 post-checkout recovery render hash | `/app/checkout/:id` | First-time paid after pay | Recovery display hash `1308:4cd63c80` vs expected `7196:8422861b` — thin/wrong body. |
| TEST338 accepted `server_full_draft` still mounts review | `/app/checkout/:id` | First-time paid after pay | Pipeline-accepted body does not establish SoT / mount review (0 vs 1). |
| After-pay review gate (Marcus/Elena) | `/app/create` after pay | Paid session | Visible rebuild review omits signer “Marcus”. |
| Visible-shell paid-session fallback (2) | `/app/create` after pay | Paid vs unsigned session | Paid session missing “Marcus Thompson”; unsigned session still paints a full Services Agreement. |
| Render surface starter clone after checkout | `/app/checkout/:id` | First-time paid | Off-by-one (757 vs 758) on the starter-clone retry guard. |
| `premiumPostPaymentHydration` network fail | `/app/checkout/:id` | First-time paid | First-pass network fail becomes `premium_network_local_recovery` instead of retryable. |
| `premiumGenerationApiAvailability` SoT blocked | `/app/create` after generation | Paid owner | 5399-char server draft is rejected as mislabeled `server_full_draft`. |
| TEST515 freeze-prep ok is not pipeline acceptance | `/app/create` | First-time paid create | Structural prep is treated as a successful paid generate. |
| TEST517 dashboard create review body (2) | `/app` dashboard create | Paid owner from dashboard | Review is `premium_degraded_server_local_recovery` / truncated `document_text`. |

### Dashboard resume, send, sign, receipt

| Identity | Route | User | Customer-visible consequence |
|---|---|---|---|
| Dashboard signer-setup resume → Continue paint | `/app` → `/app/create` | Returning paid owner | Resume prefers the wrong paint path (source window / persist gate). |
| Dashboard resume preview title | `/app` → `/app/create` | Returning paid owner | Employment intake paints “SERVICES AGREEMENT”. |
| TEST570 review-vs-signature decision before signer setup | `/app`, `/app/create` | Paid owner | Delivery-track decision is not latched before signer setup. |
| TEST518 dashboard create metadata prefill (2) | `/app` dashboard create | Paid owner | Signer slots do not carry intake legal names/addresses. |
| TEST412 intake signer metadata prefill | `/app/create` signer setup | Paid owner | Prefill/confirmation path does not complete. |
| TEST499 draft-limit 403 persist uses review-first | `/app/create` | Returning paid at draft cap | Persist still uses the free-draft path (source). |
| Durable agreement id (2) | `/app/create` | Paid owner | Finalize/handoff source no longer clears persist error or prefers intake legal names. |
| TEST464 completed signed artifact | `/app/agreements/:id/view-signed`, `/app/done/:id` | Paid owner after four-party sign | Completed corpus missing “Eve Green” witness. |
| TEST497 view-signed body matches frozen corpus | `/app/agreements/:id/view-signed` | Paid owner | Fully-executed overlay does not preserve the frozen clause body. |

## Authentication / access / security (6)

All six reproduced in isolation.

| Identity | Route | User | Customer-visible consequence |
|---|---|---|---|
| TEST437 subscription 404 (2) | `/app/checkout/:id` | Post-checkout owner | 404 from subscription fetch can throw or fail to clear tier to free. |
| TEST521 draft_limit_reached terminal copy | `/app/create` | Returning paid at cap | Draft-limit failure formatter is missing from persist (source). |
| TEST544 bootstrap re-runs after auth settle | `/app/create` | Owner opening create while auth loads | Source expects `useAuth().loading`; bootstrap may run once on a stale session. |
| Checkout dev bypass (2) | `/app/checkout/:id` | Guest checkout | Source no longer contains demo-settlement / `cc-email` markers. Treat as checkout-boundary drift, not a license to touch live Stripe. |

## Proposed repair batches (≤10 identities)

Paid authenticated create → review is first. Do not start with hash-parity or Free Starter identity.

### Batch 1 — smallest commercial step (10 identities)

**Theme:** paid `/app/create` must open the paid Pro review entry, not Free Starter, and first-time checkout must share that entry with returning paid create — including signer bullets.

1. TEST490 — paid create must not route into Free Starter  
2. TEST492 — workspace Pro skips free-starter latch when UI tier is stale  
3. TEST500 — returning paid must not dead-end on starter-shell validation  
4. TEST508 — `guided_continue` waits for entitlement before the starter gate  
5. TEST502-2 — returning workspace-pro resolves `paid_pro`, not `free_starter`  
6. TEST502-6 — accepted paid corpus enables canonical review entry  
7. TEST501-2 — post-checkout and returning plans share review mount flags  
8. TEST501-5 — authorized signer bullets hydrate Sarah Mitchell / Michael Torres  
9. TEST503-4 — same signer-bullet hydration on returning reuse  
10. TEST504-7 — same signer-bullet hydration on corpus handoff  

**Why this batch:** one shared root cause (paid create shell + canonical review-entry + signer hydration). Five files, all isolated-reproducible. Fixing it is the difference between a paying customer seeing Free Starter versus the paid review they just bought.

**Out of batch 1 on purpose:** TEST504-6 (source-only handoff symbol), TEST505/506 (same family, second pass), persist/draft-limit, after-pay paint, dashboard resume, completed-artifact.

### Later batches

2. **Returning paid persist and stale-UI** (7): TEST499, TEST504-6, TEST505-1, TEST505-2, TEST506, TEST521, durable-id persist clear.  
3. **After-pay first review paint** (10): TEST221, TEST225, TEST243, TEST338, After-pay Marcus gate, Visible-shell (2), Render-surface starter clone, `premiumPostPaymentHydration`, `premiumGenerationApiAvailability`.  
4. **Dashboard create / resume / delivery track** (6): dashboard resume paint (2), TEST570, TEST518 (2), TEST412.  
5. **Send → sign → receipt** (3): TEST464, TEST497, durable-id legal-name handoff.  
6. **Auth/session/checkout boundary** (5 remaining after TEST521): TEST437 (2), TEST544, checkout bypass (2).  
7+. **Document/signing/recovery** in families of ≤10: degraded `json_parse` acceptance (`premiumCompletionPipeline`, TEST349/358/372), SoT hash parity (TEST587, TEST514, TEST219), notice/heading/execution-block, brand-licensing leftovers (TEST438/440/441/450/451/456).  
   Then brittle source-inspection and unrelated Free Starter / preview / copy. Do not spend a repair sprint on suite-load `source` until the loader contract is fixed as its own infrastructure batch.

## What not to do in Phase 3B

- Do not rewrite snapshots, expected hashes, or source-window widths to hide failures.  
- Do not weaken assertions.  
- Do not start with TEST587 hash-parity or Free Starter TEST372/550.  
- Do not treat the 14 suite-load files as paid-journey proof until they collect.  
- Do not authorize launch: 234 persistent assertion failures remain.

## Appendix — every classified identity

### paid-user launch blocker (38)

| File | Identity | Test method |
|---|---|---|
| `paidProAfterPayReviewScreenGate.test.ts` | after-pay review-screen gate — Continue after signers sample dump 2 (Marcus/Elena/California): paid session + visible rebuild + two signers opens review gate | source-inspection |
| `paidProDashboardSignerSetupResumeFinalReviewPaint.test.tsx` | dashboard signer-setup resume → Continue paints finalized signer corpus intake prefers post-finalize paint before verified GET gate and blocks on persist failur | source-inspection |
| `paidProDashboardSignerSetupResumePreviewPaint.test.tsx` | dashboard signer-setup resume paints accepted server_full_draft preview ForcedRoute paints employment title from intake when corpus has no title line | source-inspection |
| `paidProRenderSurface.test.ts` | paid Pro render surface guards returns premium_unavailable_retry when paid pick is starter clone after checkout | behavioral |
| `paidProSignerFinalizeDurableId.test.ts` | paidPro signer finalize durable agreement id (universal) canonical review handoff prefers any intake legal names over disposable demo seeds | source-inspection |
| `paidProSignerFinalizeDurableId.test.ts` | paidPro signer finalize durable agreement id (universal) finalize ensures a workspace agreement id before snapshot/persist | source-inspection |
| `paidProTest221FirstReviewNoLegacyShell.test.tsx` | paidPro Test221 first review after degraded recovery — no legacy starter shell post-checkout recovery display blocks starter shell, legacy panels, and starter c | source-inspection |
| `paidProTest225PaymentToFirstReviewLatency.test.ts` | paidPro Test225 payment to first review latency integration: structural retry path can return server_full_draft_retry when retry is enabled in test | source-inspection |
| `paidProTest243RecoveryRender.test.ts` | paidPro Test243 post-checkout recovery render handoff server_full_draft acceptance path unchanged (SoT + render + advisory skip) | source-inspection |
| `paidProTest338PostCheckoutAcceptedCorpusStillMounts.test.ts` | paidProTest338PostCheckoutAcceptedCorpusStillMounts pipeline-accepted server_full_draft variant still establishes SoT and mounts review | behavioral |
| `paidProTest412IntakeSignerMetadataPrefill.test.ts` | TEST412_INTAKE_SIGNER_METADATA_PREFILL production fixture: seed + handoff + gate complete with intake_prefill_requires_confirmation path | behavioral |
| `paidProTest464CompletedSignedArtifact.test.ts` | TEST464 — completed signed artifact after four-party VS01 signing materializes completed signed corpus with all four entity witness blocks and idempotent snapsh | behavioral |
| `paidProTest490CreateFlowRouting.test.ts` | TEST490 — paid create flow must not route into Free Starter review paid create submit still allows early persist when skipping free starter | behavioral |
| `paidProTest492CreateFlowReviewHandoff.test.ts` | TEST492 — paid /app/create local_parse then pipeline acceptance workspace pro entitlement skips free-starter latch when React tier is stale free | behavioral |
| `paidProTest497CompletedCorpusFrozenBody.test.ts` | TEST497 — completed PDF / view-signed body matches frozen corpus (execution overlay only) resolveVs01FullyExecutedSignedCorpus preserves frozen clause body thro | behavioral |
| `paidProTest499ReturningPaidCreateDraftLimitPersist.test.ts` | TEST499 — returning paid create survives draft-limit 403 with accepted corpus 3 — paid accepted create routes persist through review-first handoff (not free dra | source-inspection |
| `paidProTest500CreateFlowStarterShellBypass.test.ts` | TEST500 — returning paid create must not dead-end on starter-shell validation final review corpus uses pipeline body when authoritative hydrated is starter-leng | source-inspection |
| `paidProTest501CanonicalPaidProReviewEntry.test.ts` | TEST501 — canonical paid Pro review entry (post-checkout + returning create) 2 — post-checkout and returning paid plans share the same review UI mount flags | source-inspection |
| `paidProTest501CanonicalPaidProReviewEntry.test.ts` | TEST501 — canonical paid Pro review entry (post-checkout + returning create) 5 — authorized signer bullet lines hydrate Sarah Mitchell / Michael Torres metadata | source-inspection |
| `paidProTest502ReturningPaidCreatePostPaymentParity.test.ts` | TEST502 — returning paid create reuses post-payment Pro journey 2 — workspace-pro returning user resolves paid_pro shell, not free_starter | source-inspection |
| `paidProTest502ReturningPaidCreatePostPaymentParity.test.ts` | TEST502 — returning paid create reuses post-payment Pro journey 6 — accepted paid corpus enables canonical entry with signer hydration | source-inspection |
| `paidProTest503ReturningPaidPostPaymentReuse.test.ts` | TEST503 — returning paid reuses first-time post-payment Pro review entry 4 — authorized signer bullets hydrate Sarah Mitchell / Michael Torres | source-inspection |
| `paidProTest504ReturningPaidCorpusHandoff.test.ts` | TEST504 — returning paid corpus handoff promotes accepted Pro body before final review 6 — intake wires synchronous corpus handoff before canonical review entry | source-inspection |
| `paidProTest504ReturningPaidCorpusHandoff.test.ts` | TEST504 — returning paid corpus handoff promotes accepted Pro body before final review 7 — Sarah Mitchell / Michael Torres signer metadata handoff from intake b | source-inspection |
| `paidProTest505ReturningPaidStaleUiAndSignerHandoff.test.ts` | TEST505 — returning paid stale UI suppression + metadata-only signer finalize first-time post-checkout canonical plan remains unchanged | source-inspection |
| `paidProTest505ReturningPaidStaleUiAndSignerHandoff.test.ts` | TEST505 — returning paid stale UI suppression + metadata-only signer finalize signer finalize preserves frozen canonical corpus hash | source-inspection |
| `paidProTest506ReturningPaidProfessionalCorpusRegression.test.ts` | TEST506 — paid SoT UI suppression, signer parsing, professional corpus gate, model route G — first-time post-checkout and returning paid create share canonical  | source-inspection |
| `paidProTest508FourPartyGuidedContinueBypass.test.ts` | TEST508 — guided_continue /app/create bypasses starter gate for provisional paid guided_continue stageA path awaits entitlement resolve before starter gate | source-inspection |
| `paidProTest515FirstPaidCreateCanonicalRoute.test.ts` | TEST515 — first paid create canonical route freeze prep ok + validation rejected — structural prep does not imply pipeline acceptance | behavioral |
| `paidProTest517ServerDocumentTextAlias.test.ts` | paidPro Test517 server document_text alias dashboard_paid_create renders Review from normalized authoritative body | behavioral |
| `paidProTest517ServerDocumentTextAlias.test.ts` | paidPro Test517 server document_text alias degraded json_parse with substantive document_text preserves firstDocumentLen in second-gen log | behavioral |
| `paidProTest518DashboardCreateIntakeMetadataPrefill.test.ts` | TEST518 — dashboard_paid_create intake metadata prefill planCanonicalPaidProSignerHandoff hydrates intake manifest without recipient candidates | behavioral |
| `paidProTest518DashboardCreateIntakeMetadataPrefill.test.ts` | TEST518 — dashboard_paid_create intake metadata prefill signer setup slots carry legal entity names and addresses from intake | behavioral |
| `paidProTest570DashboardReviewDecisionFlow.test.ts` | TEST570 dashboard paid-create review decision precedes signer setup AgreementBuilderIntake routes the delivery-track decision ahead of signer setup | source-inspection |
| `paidProVisibleDocumentShellPaidSessionFallback.test.ts` | Issue #83: Paid session + 200-999 char rebuild paints resolveCanonicalPlainForVisibleShell with paid session returns 200-999 char rebuild when paid session is a | behavioral |
| `paidProVisibleDocumentShellPaidSessionFallback.test.ts` | Issue #83: Paid session + 200-999 char rebuild paints resolveCanonicalPlainForVisibleShell with paid session returns empty when no paid session and body < 1001 | behavioral |
| `premiumGenerationApiAvailability.test.ts` | premiumGenerationApiAvailability successful server draft establishes SoT and enables guided authority | behavioral |
| `premiumPostPaymentHydration.test.ts` | post-payment Pro hydration network failure on first-pass still returns retryable pipeline result without rejected_paid_corpus | behavioral |

### authentication/access/security blocker (6)

| File | Identity | Test method |
|---|---|---|
| `paidProTest437Subscription404PostCheckout.test.ts` | TEST437 — subscription 404 does not poison post-checkout Pro completion fetchSubscription treats HTTP 404 as no-subscription without error | behavioral |
| `paidProTest437Subscription404PostCheckout.test.ts` | TEST437 — subscription 404 does not poison post-checkout Pro completion refresh on 404 clears tier to free without throwing | behavioral |
| `paidProTest521ReturningPaidDraftLimitTerminal.test.ts` | TEST521 — returning paid create + validation fail + draft_limit_reached terminal recovery 6 — ensureReviewAgreementWorkspaceId surfaces draft_limit_reached with | source-inspection |
| `paidProTest544DirectEntryBootstrapOrder.test.ts` | TEST544 — direct-entry bootstrap ordering vs auth/session/org settle AgreementBuilderIntake re-runs the bootstrap once auth settles (order fix is wired) | source-inspection |
| `simpleCheckoutDevBypass.test.ts` | SimpleCheckoutPage dev payment bypass (static) guest checkout creates demo session user with email from form | source-inspection |
| `simpleCheckoutDevBypass.test.ts` | SimpleCheckoutPage dev payment bypass (static) guest checkout uses demo settlement, not live Stripe | source-inspection |

### document/signing/recovery blocker (129)

| File | Identity | Test method |
|---|---|---|
| `canonicalAgreementCorpus.test.ts` | CanonicalAgreementCorpus convergence blocks structural mutation and independent rendering after premium acceptance | behavioral |
| `canonicalAgreementCorpus.test.ts` | CanonicalAgreementCorpus convergence guided and simple final review read the same canonical hash | behavioral |
| `canonicalFinalPartyManifest.test.ts` | canonicalFinalPartyManifest (test35) does not promote client representative signer name to partyName when entity name missing | behavioral |
| `canonicalPartyLegalNameSanitizer.test.ts` | canonicalPartyLegalNameSanitizer isolates party 2 legal name when party 1 contaminated input is fused | behavioral |
| `guidedFinalReviewAuthoritativeBody.test.ts` | guidedFinalReviewAuthoritativeBody hard-stops to paidProSourceOfTruth instead of source none after acceptance | behavioral |
| `guidedVs01BridgeHandoffRegression.test.ts` | guided VS01 bridge handoff regression (failure shape) aligns final review display, VS01 handoff, and signing track on the same finalized signer corpus | behavioral |
| `paidProAcceptanceExecutionBlockInvariant.test.ts` | paidProAcceptanceExecutionBlockInvariant post-freeze review render stays hash-identical to SoT after execution append at accept | behavioral |
| `paidProAcceptedPaintLock.test.ts` | accepted paint lock after freeze (Niceman/Waffle retest) guided paid gate fail-opens to agreement document when validated empty | behavioral |
| `paidProAcceptedSourceDiscipline.test.ts` | paidPro accepted source discipline keeps one accepted hash across display, copy, review render, and polish handoff | behavioral |
| `paidProAlexPixelForgeSignerFinalizeReady.test.ts` | Alex/PixelForge signer finalize signing-ready does not full-rewrite an already-titled Pro corpus (avoids freeze heading anomaly) | behavioral |
| `paidProCorpusAcceptance.test.ts` | paid pro corpus acceptance rejects malformed naked party-name opening before repair; accepts after safe display guard | behavioral |
| `paidProEntityMetadataPipelineAcceptance.test.ts` | paid Pro pipeline accepts server draft with harmless entity-metadata placeholders does not reject to rejected_paid_corpus when only [State]/[Address] stubs are  | behavioral |
| `paidProExecutionBlockPlacement.test.ts` | paidProExecutionBlockPlacement post-SoT review render and polish stay hash-identical to authoritative corpus | behavioral |
| `paidProExecutionBlockSurfaceInvariants.test.ts` | paidProExecutionBlockAuthority synthesis guards rebuildSignatureBlocksWithPartyIdentities is a no-op when corpus already has authoritative block | behavioral |
| `paidProFrozenGluePaintPath.test.ts` | frozen / classify paint path — letter-glued subsections projectPaidProFrozenSoTDisplayPlain repairs General Terms9.1 | behavioral |
| `paidProGoldenFixture.test.ts` | paidProHardening golden fixture (freeProQaTemplateATest204) acceptance safe-display repairs malformed test204 corpus before SoT establish | behavioral |
| `paidProLawDogAcmeReviewedDocumentIntegrity.test.ts` | LawDog/Acme reviewed-document integrity P0 SoT / first-review paint / persist share one immutable canonical hash | behavioral |
| `paidProLawDogAcmeReviewedDocumentIntegrity.test.ts` | LawDog/Acme synthetic P0 agreement defects freeze + frozen first-review paint: opening, notices, signer labels, and signature block agree | behavioral |
| `paidProLawDogAcmeSignerFinalizeHydration.test.ts` | LawDog/Acme signer finalize → signing-ready document hydration P0 finalizes into one hydrated authoritative corpus used by render, snapshot, and signature-link  | behavioral |
| `paidProLawDogAcmeSyntheticP0.test.ts` | LawDog/Acme synthetic P0 agreement defects freeze + frozen first-review paint: opening, notices, signer labels, and signature block agree | behavioral |
| `paidProNoticeMetadataLabelContamination.test.ts` | party metadata label contamination (Role/Attn/Email/By) rebuilds contaminated notices into two clean stanzas for Alex/PixelForge | behavioral |
| `paidProPostFreezeCorpusInvariant.test.ts` | paidProPostFreezeCorpusInvariant establish SoT hash matches frozen snapshot and post-freeze review render plain | behavioral |
| `paidProPostFreezeCorpusInvariant.test.ts` | paidProPostFreezeCorpusInvariant readonly HTML input plain matches SoT hash (HTML itself differs) | behavioral |
| `paidProQuadPartyAcceptanceSoTAuthority.test.ts` | paid Pro quad-party acceptance SoT authority wire→freeze prep is deterministic and idempotent (single accepted-hash family) | behavioral |
| `paidProReviewDisplaySanity.test.ts` | paidProReviewDisplaySanity server_full_draft SoT display remains hash-stable after review render resolve | behavioral |
| `paidProSignerMetadataTypingPerformance.test.ts` | paidProHardening signer metadata typing performance keystroke on partyAddress leaves SoT, review, pin, and snapshot unchanged | behavioral |
| `paidProSignerMetadataTypingPerformance.test.ts` | paidProHardening signer metadata typing performance keystroke on signerEmail leaves SoT, review, pin, and snapshot unchanged | behavioral |
| `paidProSignerMetadataTypingPerformance.test.ts` | paidProHardening signer metadata typing performance keystroke on signerName leaves SoT, review, pin, and snapshot unchanged | behavioral |
| `paidProSignerMetadataTypingPerformance.test.ts` | paidProHardening signer metadata typing performance keystroke on signerTitle leaves SoT, review, pin, and snapshot unchanged | behavioral |
| `paidProSignerMetadataTypingPerformance.test.ts` | paidProHardening signer metadata typing performance stages metadata locally — consumed authority not promoted while typing | behavioral |
| `paidProTest219FirstReviewCorpus.test.ts` | paidPro Test219 first-review corpus authority accepted authoritative body length remains above 10k and display gate is active | behavioral |
| `paidProTest219FirstReviewCorpus.test.ts` | paidPro Test219 first-review corpus authority first Pro review plain matches SoT hash without integrity or compiler repair | behavioral |
| `paidProTest235ResponseNormalization.test.ts` | paidPro Test235 premium response normalization HTTP 200 Test235 wire accepts normalized server document instead of local recovery | behavioral |
| `paidProTest236ExecutionBlockPollution.test.ts` | paidPro Test236 execution block pollution prefers Consulting Agreement title when intake is not mutual | behavioral |
| `paidProTest300PostFinalizeIntegrity.test.ts` | Test300 post-finalize signer metadata/action integrity copy/export/edit/review surfaces share the same hydrated snapshot hash | behavioral |
| `paidProTest300PostFinalizeIntegrity.test.ts` | Test300 post-finalize signer metadata/action integrity review document contains hydrated Sarah Mitchell and Michael Torres metadata | behavioral |
| `paidProTest303PostFinalizeEditSave.test.ts` | Test303 post-finalize edit save preserves signer metadata clause edit save re-hydrates signer metadata and does not clear signing snapshot | behavioral |
| `paidProTest310VisibleShellDisplayPlain.test.ts` | Test310 visible shell display plain routing resolveCanonicalPlainForVisibleShell uses review render plain when SoT present | behavioral |
| `paidProTest313HeadingRender.test.tsx` | TEST313 paid Pro heading render hardening uses verified server GET corpus for visible shell instead of live preview picker / SoT | behavioral |
| `paidProTest315ReviewCopyHydration.test.ts` | Test315 review-ready signer metadata hydration review-link pinned corpus matches hydrated display corpus after signer metadata handoff | behavioral |
| `paidProTest333PartySlotRegression.test.ts` | paidProTest333PartySlotRegression execution block has exactly two party sections and one witness block | behavioral |
| `paidProTest334PartySlotRegression.test.ts` | paidProTest334PartySlotRegression post-finalize hydration leaves exactly one execution block with corrected signer authority | behavioral |
| `paidProTest335PostCheckoutSubstanceRegression.test.ts` | paidProTest335PostCheckoutSubstanceRegression latched accepted authority is retained before SoT commit (render gate is pipeline/SoT) | behavioral |
| `paidProTest335PostCheckoutSubstanceRegression.test.ts` | paidProTest335PostCheckoutSubstanceRegression pipeline-accepted server_full_draft_retry still establishes SoT when establish uses server_full_draft | behavioral |
| `paidProTest337GluedHeadingRegression.test.ts` | paidProTest337GluedHeadingRegression establish + review render preserve split headings and SoT display parity | behavioral |
| `paidProTest343ReviewerLinkFormattingRegression.test.ts` | paidProTest343ReviewerLinkFormattingRegression owner post-finalize review and copy surfaces match reviewer display; transport bytes stay frozen | behavioral |
| `paidProTest344ReviewerDisplayFormattingRegression.test.ts` | paidProTest344ReviewerDisplayFormattingRegression owner review, SoT parity, and frozen transport bytes remain aligned after finalize | behavioral |
| `paidProTest344ReviewerDisplayFormattingRegression.test.ts` | paidProTest344ReviewerDisplayFormattingRegression reviewer HTML bolds main headings and renders enumerated clauses on separate blocks | behavioral |
| `paidProTest349JsonParseDegradedProRender.test.ts` | paidPro test349 json_parse degraded Pro render accepts HTTP 200 degraded/json_parse envelope on both attempts without stranding checkout | behavioral |
| `paidProTest358JsonParseRetry502PreservesRecovery.test.ts` | paidPro test358 json_parse retry 502 preserves recovery accepts degraded/json_parse display-eligible corpus without structural retry | behavioral |
| `paidProTest358JsonParseRetry502PreservesRecovery.test.ts` | paidPro test358 json_parse retry 502 preserves recovery keeps first degraded/json_parse corpus when structural retry fails with 502 | behavioral |
| `paidProTest368TripartiteExecutionBlockRegression.test.ts` | paidPro test368 tripartite execution block regression signer metadata slots preserve slot-locked party-to-signer mapping | behavioral |
| `paidProTest369TripartiteExecutionHydrationRegression.test.ts` | paidPro test369 tripartite execution hydration regression signer metadata slots are 3 with partial signer names from labeled intake | behavioral |
| `paidProTest370DegradedJsonParseTripartiteRecovery.test.ts` | paidPro test370 degraded json_parse tripartite recovery HTTP 200 degraded/json_parse on both attempts upgrades via intake local recovery | behavioral |
| `paidProTest372DegradedJsonParseRecovery.test.ts` | paidPro Test372 degraded json_parse recovery commits eligible degraded recovery to paid Pro SoT | behavioral |
| `paidProTest372DegradedJsonParseRecovery.test.ts` | paidPro Test372 degraded json_parse recovery uses server degraded document for local recovery when client gates soft-fail | behavioral |
| `paidProTest391NoticeContactAuthority.test.ts` | TEST391 — notice contact authority & optional contact display 5) repaired acceptance body is the exact body frozen into paidProSourceOfTruth | behavioral |
| `paidProTest392DocumentBoundaryAuthority.test.ts` | TEST392 — document boundary authority & professional output integrity freezes boundary-repaired body into SoT and keeps review/signing surfaces aligned | behavioral |
| `paidProTest393GenerationAuthority.test.ts` | TEST393 — generation authority & clause family structural integrity Phase 4 — live pipeline path: acceptance → boundary → SoT → review → signer parity | behavioral |
| `paidProTest396MultiPartyFreeze.test.ts` | TEST396 — multi-party Pro freeze failure regression establishes frozen SoT with 4 parties and no fatal placeholders | behavioral |
| `paidProTest405FourPartySignerMetadataHydration.test.ts` | TEST405_FOUR_PARTY_SIGNER_METADATA_HYDRATION hydrates all 4 notice stanzas, preserves 4-party execution, and keeps display hash parity | behavioral |
| `paidProTest408TitleRendering.test.ts` | TEST408 — Pro agreement title rendering and opening collapse repair keeps frozen review display parity-safe without section-render normalization on locked path | behavioral |
| `paidProTest409TitleClassification.test.ts` | TEST409 — chronic Pro title classification on review and post-finalize paths repairs production-style glued title on first-review and visible-shell paths | behavioral |
| `paidProTest411SectionStructureCompleteness.test.ts` | TEST411 — Canonical Section Structure Completeness Authority G — fatally incomplete corpus cannot become frozen SoT | behavioral |
| `paidProTest413BlankRenderNoticeStanzas.test.ts` | TEST413_BLANK_RENDER_MISSING_PARTY_NOTICE_STANZAS accepted server_full_draft with 4 canonical parties renders — no partySlots 5, no missing stanzas | behavioral |
| `paidProTest414SignerMetadataAlignment.test.ts` | TEST414_SIGNER_METADATA_LEGAL_ENTITY_ALIGNMENT SoT freeze + hydration keeps four execution blocks aligned without scope-phrase entities | behavioral |
| `paidProTest419BlankReviewAfterSoTRejection.test.ts` | TEST419 — blank Pro review after SoT pre-freeze structural rejection production lifecycle: accepted server_full_draft + SoT reject → deterministic recovery moun | behavioral |
| `paidProTest422ProfessionalCorpusContamination.test.ts` | TEST422 — professional corpus contamination gate + signer metadata monotonic blocks handoff write that downgrades signer metadata after frozen SoT | behavioral |
| `paidProTest426ShortIntakeCorpusDedupe.test.ts` | TEST426 — short intake corpus dedupe and single-source Pro authority freeze prep + validation share one canonical corpus hash — no Frankenstein stitch | behavioral |
| `paidProTest427RedMesaOrphanSectionFragment.test.ts` | TEST427 — Red Mesa orphan subsection fragment repair before Pro SoT acceptance repair merges fragment into paragraph and freeze accepts server_full_draft with h | behavioral |
| `paidProTest433FourPartyLiveFreezeRegression.test.ts` | TEST433 — four-party live freeze heading anomaly + recovery guard structural recovery stays tiny and cannot masquerade as server_full_draft | behavioral |
| `paidProTest434DegradedJsonParseNorthStarRegression.test.ts` | TEST434 — degraded json_parse without server_full SoT crash establishPaidProSourceOfTruth blocks mislabeled tiny server_full_draft without clause-family throw | behavioral |
| `paidProTest436FormattingNormalizerIdempotency.test.ts` | TEST436 — freeze-path idempotency resolvePaidProFreezeCommitText is idempotent on malformed TEST435 corpus | behavioral |
| `paidProTest438BrandLicensingPolish.test.ts` | TEST438 — Brand Licensing/Distribution executive draft polish prepare + freeze preserves 4-party substantive corpus with polished title, notices, and governing  | behavioral |
| `paidProTest440BrandLicensingDegradedRecovery.test.ts` | TEST440 — Brand Licensing degraded recovery professional-grade local recovery + display layer preserve intake roles and repair notice corruption | behavioral |
| `paidProTest441BrandLicensingFrozenDisplay.test.ts` | TEST441 — Brand Licensing frozen/display corpus authority premium completion establishes SoT with professional frozen corpus after degraded json_parse | behavioral |
| `paidProTest450BrandLicensingAuthorityHashContinuity.test.ts` | TEST450 — Brand licensing authority hash continuity after validated adoption adopted corpus keeps identical authority hashes through freeze, SoT, and review | behavioral |
| `paidProTest451SoTFreezePlaceholderReject.test.ts` | TEST451 — SoT freeze placeholder rejection after validated server adoption premium completion opens Pro review — no SoT placeholder reject or starter cache pois | behavioral |
| `paidProTest456BrandLicensingServerFullSourceOfTruth.test.ts` | TEST456 — keep substantive server_full when notice signer-setup scaffolding is nonfatal premium completion keeps server_full_draft — no structural recovery for  | behavioral |
| `paidProTest462NoticeBoundaryStanzaCollapse.test.ts` | TEST462 — Paid Pro notice boundary and stanza collapse display repair frozen server_full SoT is accepted without regeneration and display repair fixes boundarie | behavioral |
| `paidProTest472MetadataHydrationNoRotation.test.ts` | TEST472 — metadata hydration no rotation final hydrated Pro agreement notice + execution blocks match each legal entity signer | behavioral |
| `paidProTest487ProductionValidation.test.ts` | TEST487 — production validation (fresh four-party scenario) full production lifecycle: intake → SoT → review → signer setup → signing → completion | behavioral |
| `paidProTest494495CorpusStability.test.ts` | TEST494 — hash / corpus stability across stages frozen SoT never contains misplaced standalone NOTICES; review/prepare/signer hashes stay aligned | behavioral |
| `paidProTest512ReviewSessionCorpusInvariant.test.ts` | TEST512 — paid review session premium generation + post-freeze corpus hash parity 4 — after SoT freeze, review render hash matches latched canonical SoT hash ac | behavioral |
| `paidProTest514CanonicalCorpusIdentityAcrossSurfaces.test.ts` | TEST514 — canonical corpus identity across every post-freeze paid surface 1 — all twelve surfaces match canonical SoT hash after canonical-corpus-freeze | behavioral |
| `paidProTest514CanonicalCorpusIdentityAcrossSurfaces.test.ts` | TEST514 — canonical corpus identity across every post-freeze paid surface 3 — session latched canonical hash stable across repeated surface resolution | behavioral |
| `paidProTest519ProfessionalValidationRenderRegression.test.ts` | TEST519 — professional validation gates paid Pro review render rejects malformed ~2.5k server draft for professional intake — no render without validation | behavioral |
| `paidProTest520BodyAliasRegression.test.ts` | TEST520 — degraded json_parse document_text authority regression does not trigger deterministic fallback or no_server_authority for substantive degraded wire | behavioral |
| `paidProTest521BodyAliasRegression.test.ts` | TEST521 — degraded json_parse promotes document_text to server_full pipeline keeps substantive freeze candidate and avoids thin fallback | behavioral |
| `paidProTest523FullServerDocClauseFamilyStructural.test.ts` | TEST523 — full server doc clause_family_structural recovery 1 — 10k server_full_draft rejected by clause_family_structural logs exact missing family names | behavioral |
| `paidProTest523FullServerDocClauseFamilyStructural.test.ts` | TEST523 — full server doc clause_family_structural recovery 2 — full-doc rejection does not trigger deterministic thin fallback | behavioral |
| `paidProTest523FullServerDocClauseFamilyStructural.test.ts` | TEST523 — full server doc clause_family_structural recovery 3 — recovery preserves full-doc failure reason and body length | behavioral |
| `paidProTest531FullDocRejectionBlocksLateThinFallback.test.ts` | TEST531 — full-doc rejection blocks late thin fallback pipeline terminalizes rejected_paid_corpus and blocks thin local fallback | behavioral |
| `paidProTest535PostSuccessQuality.test.ts` | TEST535 — post-success Pro agreement quality (party/role/notice/signature/signer) F: existing accepted corpus render path still works (stays correct) | behavioral |
| `paidProTest536PostValidationRecovery.test.ts` | TEST536 — post-validation deterministic recovery after professional clause rejection professional-deficient ~2.9k server_full_draft is rejected, then determinis | behavioral |
| `paidProTest538AuthorityCeilingDrift.test.ts` | TEST538 — intake manifest authority ceiling (4→5 drift) still rejects a genuine notice-stanza shortfall (3 stanzas for 4 manifest parties) | behavioral |
| `paidProTest539IdentityPropagation.test.ts` | TEST539 — party identity propagation (Party 1 resurrection) B. reviewParties restore the real slot-0 identity from a contaminated consumed authority | behavioral |
| `paidProTest541SafeDisplayCacheLineage.test.ts` | TEST541 — safe-display cache lineage & stale-corpus replay 5. excess_party_notice_stanzas fires on a 5-stanza corpus and names the excess heading | behavioral |
| `paidProTest542NoticeStanzaAuthorityConsistency.test.ts` | TEST542 scratch — required-stanza count vs canonical authority divergence still flags a genuine shortfall (3 stanzas for a 4-party intake) | behavioral |
| `paidProTest553BaselineDebtClosure.test.ts` | TEST553 — Paid Pro baseline debt closure Case 2 — missing operative IP remains blocked at SoT establishment | behavioral |
| `paidProTest554Phase1LegalPartyAuthority.test.ts` | paidProTest554 Phase 1 legal-party authority Case 3 — four-party between clause with stable ordering | behavioral |
| `paidProTest563DocumentBoundaryUnresolvedTokenReason.test.ts` | TEST563 — document_boundary_blocked surfaces the real defect for a substantive 40k corpus rejects a substantive 40k+ corpus with an unresolvable render token us | behavioral |
| `paidProTest584ProfessionalIntakeConciseCorpusAuthority.test.ts` | TEST584 — professional intake concise corpus authority B — long but incomplete agreement remains blocked | behavioral |
| `paidProTest586StaleInlineExecutionTailAtAcceptance.test.ts` | TEST586 — stale inline execution tail at acceptance C — canonical witness plus stale SIGNATURES heading only | behavioral |
| `paidProTest586StaleInlineExecutionTailAtAcceptance.test.ts` | TEST586 — stale inline execution tail at acceptance L — frozen SoT execution region matches review render after acceptance prep | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — four-party parity spot check K — four-party identities preserved through review projection | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity A — TEST336 +146 diff was notice hydration in preparePaidProFrozenDisplayPlain (removed) | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity B — legal-token parity between frozen SoT and review | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity C — competing draft/server/fallback corpora cannot replace frozen SoT on review | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity G — display projection idempotent | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity I — review and signature-preparation surfaces match | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity L — execution region hash parity preserved from TEST586 | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity N — already-formatted frozen corpus has no drift on repeat render | behavioral |
| `paidProTest587FrozenSoTDisplaySurfaceCorpusParity.test.ts` | TEST587 — frozen SoT display-surface corpus parity P — revision creates new frozen SoT; review follows only after successful freeze | behavioral |
| `paidProVs01PhaseGuard.test.ts` | paidProVs01PhaseGuard resolveFinalVs01CorpusOrBlock defers during premium in progress (no signing corpus) | behavioral |
| `premiumApiHandoff.test.ts` | premiumApiHandoff runPremiumCompletion without server body returns rejected_paid_corpus in production mode | behavioral |
| `premiumAuthoritativeBodyPreservation.test.ts` | premiumAuthoritativeBodyPreservation blocks material shrink of accepted winning body | behavioral |
| `premiumCompletionPipeline.longBodyAccept.test.ts` | runPremiumCompletion long-body acceptance accepts 27k needs_details as server_full_draft without rejected_paid_corpus | behavioral |
| `premiumCompletionPipeline.longBodyAccept.test.ts` | runPremiumCompletion long-body acceptance second shorter premium response cannot overwrite first accepted long body | behavioral |
| `premiumCompletionPipeline.test.ts` | runPremiumCompletion json_parse degraded acceptance http 200 + json_parse + 8k+ document_text accepts the paid corpus (does not reject) | behavioral |
| `premiumCompletionPipeline.test.ts` | runPremiumCompletion json_parse degraded acceptance json_parse does not reject the body when it passes the paid gates (vPaid soft-fail) | behavioral |
| `premiumCompletionPipeline.test.ts` | runPremiumCompletion json_parse degraded acceptance premium acceptance reports an authoritative outcome for the degraded-but-valid body | behavioral |
| `productionPremiumReviewPath.test.ts` | productionPremiumReviewPath accepts long premium body and normalizes review corpus without manual signature fields | behavioral |
| `reviewCorpusAuthority.test.ts` | reviewCorpusAuthority prefers accepted draft corpus over stale pinned session corpus | behavioral |
| `reviewFirstDisplayCorpus.test.ts` | reviewFirstDisplayCorpus prefers paid Pro SoT over starter purpose and short preview fields | behavioral |
| `reviewFirstDisplayCorpus.test.ts` | reviewFirstDisplayCorpus renders review-first display corpus unchanged without structural canonicalization | behavioral |
| `signerFullLegalName.test.ts` | signerFullLegalName five-party Ironclad fixture resolves full legal entity names for signer cards | behavioral |
| `simpleProFinalReviewCorpus.test.ts` | simpleProFinalReviewCorpus (test28) does not prefer longer picker/server draft over signer-applied authoritative on final review | behavioral |
| `starterDraftHardening.test.ts` | regression fixture: 3-party consulting agreement routes as consulting_agreement | behavioral |

### unrelated product area (33)

| File | Identity | Test method |
|---|---|---|
| `agreementPreviewFromDraft.test.ts` | buildAgreementPreviewText includes title parties and sections | behavioral |
| `agreementPreviewFromDraft.test.ts` | buildAgreementPreviewText marketing agency dense scope shows OWNERSHIP OF ACCOUNTS & Data prestige after commercial (scope ‘reporting’ list tail is not a report | behavioral |
| `agreementPreviewSync.test.ts` | extractStructuredPatchesFromPreview extracts payment_terms when section 2 text changes | behavioral |
| `draftPipelineRegression.test.ts` | draft pipeline: defaults only when data absent empty intake gets placeholder defaults | behavioral |
| `draftPipelineRegression.test.ts` | draft pipeline: defaults only when data absent minimal intake without payment gets payment placeholder | behavioral |
| `draftPipelineRegression.test.ts` | draft pipeline: structured fact preservation development agreement preserves scope and duration | behavioral |
| `guidedQaCorpusIntegrity.test.ts` | guided Q&A corpus integrity — QA fixtures A. AI automation: reconciles 40/30/30 without build-heavy, even thirds, or raw Milestone-based | behavioral |
| `harborDemoContinuePersistFinalReview.test.ts` | harborDemoContinuePersistFinalReview Issue B: SimpleProFinalReviewScreen mounts after demo finalize render ternary excludes demo+premiumCompletion+signerMetadat | source-inspection |
| `harborDemoContinuePersistFinalReview.test.ts` | harborDemoContinuePersistFinalReview Issue H: empty generation preserves starter text starter fallback updates lastKnownGoodAuthoritativeDraftRef to prevent use | source-inspection |
| `intakeClarificationPolicy.test.ts` | prepareParsedDraftForIntakeGeneration still blocks when contracting parties cannot be inferred | behavioral |
| `intakeNamedPartyFallback.test.ts` | multi-party extraction: 3, 4, and 5 signers survive full pipeline 4 signers survive runIntakeDefaultsAndRoles + canonicalize | behavioral |
| `liveDraftHeuristics.parties.test.ts` | buildLiveDraftPreview parties extraction does not truncate on period inside Dr. style names when between clause is clean | behavioral |
| `paidProAgreementTitleScope.test.ts` | Test372 Free 2-party identity isolation enrichStarterPreviewPartiesFromIntake replaces contaminated draft party names | behavioral |
| `paidProDomainScopeGuard.test.ts` | Test372 Free 2-party identity isolation enrichStarterPreviewPartiesFromIntake replaces contaminated draft party names | behavioral |
| `paidProSignerSetupCopy.test.tsx` | paidProSignerSetupCopy renders tighter signer setup title, body, and workflow trail | behavioral |
| `paidProTest369TripartiteExecutionHydrationRegression.test.ts` | paidPro test369 tripartite execution hydration regression free starter governing law contains Texas | behavioral |
| `paidProTest372FreeStarterIdentityRegression.test.ts` | Test372 Free 2-party identity isolation enrichStarterPreviewPartiesFromIntake replaces contaminated draft party names | behavioral |
| `paidProTest374ProAgreementRegression.test.ts` | Test372 Free 2-party identity isolation enrichStarterPreviewPartiesFromIntake replaces contaminated draft party names | behavioral |
| `paidProTest550FreeStarterOpeningPartyAuthority.test.ts` | TEST550 — Free Starter opening, party identity, and role authority Case 1 — Cedar Ridge / Northwind natural-language intake | behavioral |
| `paidProTest550FreeStarterOpeningPartyAuthority.test.ts` | TEST550 — Free Starter opening, party identity, and role authority Case 2 — reversed intake mention order (provider named before client) | behavioral |
| `paidProTest550FreeStarterOpeningPartyAuthority.test.ts` | TEST550 — Free Starter opening, party identity, and role authority Case 7 — anti-fixture guard with unrelated entities | behavioral |
| `paidProTest550FreeStarterOpeningPartyAuthority.test.ts` | TEST550 — Free Starter opening, party identity, and role authority Case 9 — conversion-flow parity: free_starter shell without comparison card | behavioral |
| `paidProTest553BaselineDebtClosure.test.ts` | TEST553 — Paid Pro baseline debt closure Case 12 — Free Starter funnel surfaces remain isolated from Paid Pro repair (TEST549 non-regression) | behavioral |
| `partyFormat.test.ts` | buildLiveDraftPreview parties line formats between clause with state and title case | behavioral |
| `polishProAgreementDisplayLayer.test.ts` | polishProAgreementDisplayLayer normalizes agreement opening phases structurally and strips review execution phase | behavioral |
| `premiumDraftTransform.test.ts` | synthesizePremiumScopeAndOperativeFields replaces wall-of-text purpose that echoes intake | behavioral |
| `proAgreementCanonicalizer.test.ts` | canonicalizeProAgreementText repairs Sue Lee QA bare skeleton clauses, notices, billing filler, and e-sign duplicates | behavioral |
| `proConversionComparisonCard.test.ts` | Pro conversion comparison copy defines free and pro comparison columns without download language | source-inspection |
| `proRefineUx.test.ts` | Paid Pro refine textarea helper + placeholder matches unified edits + reviewer-notes copy across constants and surfaces | source-inspection |
| `servicesMigrationGuidedCompletion.test.ts` | servicesMigrationGuidedCompletion extractDealVariables prioritizes fee and phase questions for migration intake | behavioral |
| `signerCountAuthority.test.ts` | Test372 Free 2-party identity isolation enrichStarterPreviewPartiesFromIntake replaces contaminated draft party names | behavioral |
| `starterProRefineCtaExperiment.test.ts` | starterProRefineUpsellCtaLabel matches product CTA; experiment arms use same label for analytics-only variant | behavioral |
| `starterTitlePartiesProseAudit.test.ts` | internal-review wording sanitizer premium preview path keeps internal phrasing for downstream Pro review tooling | behavioral |

### obsolete or brittle evaluation/source-inspection test (28)

| File | Identity | Test method |
|---|---|---|
| `agreementBuilderPaidRecoveryGuard.test.ts` | AgreementBuilderIntake paid premium completion recovery (source contract) clears runPremiumModelPassRef after failure only when not retryable and not in paid co | source-inspection |
| `agreementBuilderPaidRecoveryGuard.test.ts` | premiumCompletionPipeline degraded recovery authority (source contract) logs recoveryCandidateEligible for premium_degraded_server_local_recovery preview, not a | source-inspection |
| `agreementIntakeUniversalityGuard.test.ts` | agreement intake universality (all LawDog accounts) every INPUT generate handoff goes through intentional create prep | source-inspection |
| `paidProFirstReviewSignerSetupTransition.test.tsx` | LawDog/Acme synthetic P0 agreement defects freeze + frozen first-review paint: opening, notices, signer labels, and signature block agree | source-inspection |
| `paidProFourPartyFinalizePersistRegression.test.ts` | paidPro 4-party finalize persist + fused notices (universal) ensureReviewAgreementWorkspaceId latches visible corpus before paint-ready gate | source-inspection |
| `paidProLocalRecoverySignerFinalizeRegression.test.tsx` | paidPro local recovery signer finalize regression premium_network_local_recovery + signer finalize hydrates both parties | source-inspection |
| `paidProMutationTrace.test.ts` | paidProMutationTrace resolve/render paths do not append mutation trace entries | behavioral |
| `paidProPostFinalizeEditSignerDetails.test.tsx` | post-finalize signer correction re-hydration re-finalize path can hydrate corrected email into signature block metadata | source-inspection |
| `paidProRcJ3CorpusAuthorityDiagnostic.test.ts` | RC J3 corpus authority diagnostic traces raw mock vs safe-display vs SoT vs review-render hashes for shared two-party fixture | behavioral |
| `paidProReviewPostCommitStability.test.ts` | paidProReviewPostCommitStability (source contract) short-circuits preview rebuild when paid Pro SoT exists | source-inspection |
| `paidProSignerMetadataSession.test.ts` | runtime-like signer metadata session stability generic non-fixture parties keep distinct legal entities on first Party 2 keystroke | source-inspection |
| `paidProTest290ClassificationRetry.test.ts` | Test290 intake retry wiring handleRetryProFullDraft arms explicit retry and passes explicit_retry_pro_draft | source-inspection |
| `paidProTest301PostFinalizeVisibleSurface.test.tsx` | Test301 post-finalize visible surface uses hydrated snapshot copy/export/edit/review surfaces share display-formatted hash after finalize | source-inspection |
| `paidProTest301PostFinalizeVisibleSurface.test.tsx` | Test301 post-finalize visible surface uses hydrated snapshot resolveCanonicalPlainForVisibleShell prefers locked snapshot over canonical SoT | source-inspection |
| `paidProTest302PostFinalizeEditButton.test.tsx` | Test302 post-finalize edit agreement text opens hydrated editor tryResolvePaidProPostFinalizeEditOpen returns hydrated Sarah Mitchell / Michael Torres corpus | source-inspection |
| `paidProTest576PostFinalizeReviewParity.test.ts` | TEST576 notice-address hydration is an allowed review-parity delta stays a signer/notice-only delta after display normalization (canonical vs review_render) | source-inspection |
| `paidProUniversalFinalizePersistGtm.test.ts` | paidPro universal finalize persist GTM (all prompt types) workspace mint path has no family / jurisdiction / fixture-party branching | source-inspection |
| `paidProUniversalGtmPartyAuthorityRegression.test.ts` | universal GTM party authority (all agreement families) clarification follow-up answers override the generic rewrite and preserve facts | behavioral |
| `premiumAdvisoryPostAccept.test.ts` | fetchPremiumAdvisoryEnrichmentAfterAccept skips advisory HTTP when SoT, invariant, and review corpus are ready | behavioral |
| `premiumBatchEval.test.ts` | premium batch eval 25 messy prompts scores and prints weakest 5 | behavioral |
| `premiumNetworkRecoveryLocalDraft.test.ts` | premiumNetworkRecoveryLocalDraft test209 intake produces a usable mutual-consulting Pro draft with execution block | source-inspection |
| `premiumReviewScrollReset.test.ts` | resetPremiumReviewScrollToTop preserves scroll when review mounted and corpus transition is signer_metadata_only | behavioral |
| `proDeliveryTrackUi.test.ts` | Pro delivery track UI wiring signer setup legal entity inputs prefer canonical party names over display labels | source-inspection |
| `reviewLinkPersist.test.ts` | Test274 review-link persist blocker persist network failure does not clear pinned authoritative corpus | source-inspection |
| `reviewLinkPersist.test.ts` | Test278 review-first persist regression failReviewFirstPersist surfaces HTTP status, detail, and endpoint in user message | source-inspection |
| `starterProVs01FullFlow.test.ts` | starter Pro VS01 full flow (canonical dashboard path) suppresses intake review telemetry and blocks review displayPhase on VS01 bridge path | source-inspection |
| `starterProVs01Regression.test.ts` | starter Pro VS01 regression (source locks) SimpleCreate paid Pro post-recipient setup prefers skip-interstitial handoff before /app/send fallback | source-inspection |
| `unauthorizedSemanticInsertPolicy.test.ts` | unauthorized semantic insert policy (P0) milestone generator does not invent acceptance language | behavioral |

### timeout/load-only (15)

| File | Identity | Test method |
|---|---|---|
| `legalIdentityCreationAuthority.test.ts` | __SUITE_LOAD__ legalIdentityCreationAuthority.test.ts | suite-load |
| `paidProTest285ReviewSotParity.test.ts` | __SUITE_LOAD__ paidProTest285ReviewSotParity.test.ts | suite-load |
| `paidProTest286FirstReviewRender.test.ts` | __SUITE_LOAD__ paidProTest286FirstReviewRender.test.ts | suite-load |
| `paidProTest424JourneyQa.test.ts` | __SUITE_LOAD__ paidProTest424JourneyQa.test.ts | suite-load |
| `paidProTest427GenesisDogSimulation.test.ts` | __SUITE_LOAD__ paidProTest427GenesisDogSimulation.test.ts | suite-load |
| `paidProTest428MissingEmailExecution.test.ts` | __SUITE_LOAD__ paidProTest428MissingEmailExecution.test.ts | suite-load |
| `paidProTest428UxOverlay.test.ts` | __SUITE_LOAD__ paidProTest428UxOverlay.test.ts | suite-load |
| `paidProTest429RealUserRegressionCorpus.test.ts` | __SUITE_LOAD__ paidProTest429RealUserRegressionCorpus.test.ts | suite-load |
| `paidProTest486489DegradedRecoveryRegression.test.ts` | TEST486–489 degraded json_parse quad-party recovery TEST486 — degraded JSON parse twice → deterministic fallback → recovery adopts SoT | timeout-candidate |
| `premiumPartyNamesHandoff.dedup.test.ts` | __SUITE_LOAD__ premiumPartyNamesHandoff.dedup.test.ts | suite-load |
| `premiumPartyNamesHandoff.test.ts` | __SUITE_LOAD__ premiumPartyNamesHandoff.test.ts | suite-load |
| `resolvedPartyDisplayModel.test.ts` | __SUITE_LOAD__ resolvedPartyDisplayModel.test.ts | suite-load |
| `reviewEmailPartyRoles.test.ts` | __SUITE_LOAD__ reviewEmailPartyRoles.test.ts | suite-load |
| `reviewLinkRecipientEmailMerge.test.ts` | __SUITE_LOAD__ reviewLinkRecipientEmailMerge.test.ts | suite-load |
| `reviewPlaceholderGuard.test.ts` | __SUITE_LOAD__ reviewPlaceholderGuard.test.ts | suite-load |
