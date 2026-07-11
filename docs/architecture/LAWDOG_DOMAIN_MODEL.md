# LawDog Domain Model

**Status:** Canonical domain reference (authoritative for object semantics)  
**Parent:** [LawDog System Architecture](./LAWDOG_SYSTEM_ARCHITECTURE.md)  
**See also:** [Architecture Decisions](./LAWDOG_ARCHITECTURE_DECISIONS.md)  
**Audience:** Engineers, QA, and agents writing screenflow docs or modifying create/review/sign flows  
**Last updated:** 2026-07-08

---

## Document role

This file defines **what** exists in LawDog — persistent and transient objects, their ownership, lifetimes, and mutation rules. It sits between:

| Document | Answers |
|----------|---------|
| [LAWDOG_SYSTEM_ARCHITECTURE.md](./LAWDOG_SYSTEM_ARCHITECTURE.md) | How layers, modules, and lifecycles connect |
| **This document** | What each object is and who may touch it |
| `screenflows/*` (planned) | Entry-specific choreography using these nouns |

Screenflow children **must reference objects here** and must not redefine them.

---

## Object catalog (quick reference)

| Object | Primary type / module | Persistence tier |
|--------|----------------------|------------------|
| Agreement | `AgreementDraft` / `agreementWorkspaceApi.ts` | T3 Server |
| Draft (working) | Intake + pipeline | T0–T1 |
| Draft (server full) | API `premium_full_draft` | Transient → T3 |
| Paid Pro Source of Truth | `PaidProSourceOfTruth` | T1 Module |
| Canonical Snapshot | `CanonicalAgreementSnapshot` | T1 Module |
| Review Session | `PaidReviewSessionCorpusInvariantRecord` | T1 Module |
| Delivery Track | `proDeliveryTrackSelected` | T0 React + derived |
| Signing Packet (creator) | `AuthoritativeSigningSnapshot` | T1 Module |
| Recipient Session | `ValidatedRecipientAccess` | T4 Token + server |
| Workspace | `WorkspaceIndexAgreement` | T3 Server |
| Party | `AgreementParty` / party slots | T0–T3 |
| Signer | `PaidProSignerMetadataParty` | T0–T1 → T3 sync |
| Execution Snapshot | Same as Signing Packet (creator freeze) | T1 Module |
| Fully Executed Artifact | `Vs01FullyExecutedSignedSnapshotV1` | T3 + T5 |
| Proof objects | `content_sha256`, `receipt_hash`, sign packet | T5 |
| Supporting metadata | Markers, latches, audit, generation id | T0–T2 |

---

## 1. Core domain objects

Each subsection uses the same schema: **Purpose · Owner · Lifetime · Persistence · Allowed mutations · Consumers · Upstream · Downstream**.

---

### 1.1 Agreement

| Field | Value |
|-------|-------|
| **Purpose** | Durable commercial agreement record for an org: identity, parties, versions, audit trail, workspace metadata, and optional embedded document text fields. |
| **Owner** | Server (`AgreementDraft` API); client mirror via `agreementWorkspaceApi.ts`. |
| **Lifetime** | Created on first successful draft persist; lives until archive/delete per workspace policy. |
| **Persistence** | **T3 — Server draft** (`AgreementDraft`); dashboard list via `WorkspaceIndexAgreement`. |
| **Allowed mutations** | Server-mediated updates: party fields, workspace tags/folders, `review_sent_at`, audit events, version notes, payment-request stubs. Not mutated by recipient token surfaces for corpus substance. |
| **Consumers** | `AppDashboard`, workspace detail, recipient handoff minting, VS01 portable packet seed, proof binding. |
| **Upstream** | Intake (`ParsedDraftShape`), generation output, draft persist from create flow. |
| **Downstream** | Recipient sessions, signing completion events, fully executed artifact, proof timeline. |

**Invariants:** INV-SOT-01 (in-create SoT is freeze, not second agreement); ADR-004.  
**Types:** `AgreementDraft`, `WorkspaceIndexAgreement` in `agreementTypes.ts`, `agreementWorkspaceApi.ts`.

---

### 1.2 Draft

Draft is a **family** of pre-authoritative and in-flight corpora — not a single object.

#### 1.2a Working draft

| Field | Value |
|-------|-------|
| **Purpose** | Mutable agreement text and intake-derived shape during capture and generation. |
| **Owner** | `AgreementBuilderIntake` + intake modules. |
| **Lifetime** | `capturing_input` → SoT establishment (or starter-only preview). |
| **Persistence** | **T0 React** (form state); **T2** `claw_agreement_creator_intake_v1`; optional **T2** `claw_premium_completion_snapshot_v1`. |
| **Allowed mutations** | Full edit during capture; generation replaces body; discarded on SoT freeze for paid Pro. |
| **Consumers** | `premiumCompletionPipeline`, `intakeSmartDefaults`, generation API request builders. |
| **Upstream** | User intake, hero prefill, dashboard metadata prefill. |
| **Downstream** | Pipeline accepted corpus, server full draft, SoT. |

#### 1.2b Pipeline accepted corpus

| Field | Value |
|-------|-------|
| **Purpose** | Pre-SoT render fallback holding the hash and body accepted by `runPremiumCompletion`. |
| **Owner** | `paidProPipelineAcceptedCorpus.ts`. |
| **Lifetime** | Generation acceptance → `establishPaidProSourceOfTruth` (or explicit clear). |
| **Persistence** | **T1 Module singleton** (hash + optional body). |
| **Allowed mutations** | Set on pipeline acceptance; clear on SoT establishment or session reset. |
| **Consumers** | SoT establishment gate (skip redundant safe-display), pre-freeze render. |
| **Upstream** | `paidProCorpusAcceptance`, `premiumCompletionPipeline`. |
| **Downstream** | Paid Pro SoT. |

#### 1.2c Server full draft

| Field | Value |
|-------|-------|
| **Purpose** | Backend-validated Pro generation output (`premium_full_draft` / quality gate). |
| **Owner** | Backend `premium_full_draft_quality_gate.py`; client acceptance via `paidProCorpusAcceptance.ts`. |
| **Lifetime** | Single generation response → acceptance or rejection. |
| **Persistence** | Transient in API response; may be copied into **T3** `premium_full_document_text` / `server_full_document_text` on persist. |
| **Allowed mutations** | None after acceptance — only copied into SoT at freeze. |
| **Consumers** | `establishPaidProSourceOfTruth`, document boundary authority. |
| **Upstream** | LLM generation (pre-freeze only, ADR-007). |
| **Downstream** | Paid Pro SoT, canonical snapshot. |

**Invariants:** INV-GEN-01, INV-GEN-02, INV-GEN-03; ADR-006, ADR-007.

---

### 1.3 Paid Pro Source of Truth (SoT)

| Field | Value |
|-------|-------|
| **Purpose** | In-tab authoritative freeze of accepted paid Pro agreement body — the acceptance anchor for review, copy, finalize, and signing prep. |
| **Owner** | `paidProSourceOfTruthState.ts` (leaf state); establishment orchestration in `paidProSourceOfTruth.ts`. |
| **Lifetime** | Established at `establishPaidProSourceOfTruth`; cleared only on explicit teardown, session reset, or revision path. |
| **Persistence** | **T1 Module singleton** (`PaidProSourceOfTruth`). |
| **Allowed mutations** | **Replace once** at establishment; `replacePaidProSourceOfTruth(null)` on clear only. No in-place text edits (ADR-001). |
| **Consumers** | Review render, parity audit, canonical snapshot build, signing snapshot input, `readCanonicalAgreementCorpusForSurface`. |
| **Upstream** | Server full draft, pipeline acceptance, `paidProSotEstablishmentGate`. |
| **Downstream** | Canonical snapshot, authoritative signing snapshot, workspace persist (copy fields). |

```typescript
// Semantic contract — paidProSourceOfTruthState.ts
type PaidProSourceOfTruth = {
  text: string;
  hash: string;
  accepted_at: number;
  source: "server_full_draft";
  reviewSessionId?: string;
  signerManifestHash?: string;
};
```

**Invariants:** INV-SOT-01, INV-SOT-02; ADR-001, ADR-004.

---

### 1.4 Canonical Snapshot

| Field | Value |
|-------|-------|
| **Purpose** | Render-safe, integrity-gated projection of agreement body at document boundaries (placeholder scan, clause families, execution block count, commercial specificity). |
| **Owner** | `canonicalAgreementSnapshot.ts`. |
| **Lifetime** | Built at freeze and on surface-specific reads; may coexist with frozen corpus registry. |
| **Persistence** | **T1 Module singleton** (`getFrozenCanonicalAgreementCorpus`); not proof. |
| **Allowed mutations** | Rebuilt via `buildCanonicalAgreementSnapshot` / freeze paths; not user-edited. Display normalization only through classified deltas. |
| **Consumers** | Review HTML, copy surfaces, parity expected hash, VS01 handoff reads, safe display cache. |
| **Upstream** | Paid Pro SoT, server document text, signer-hydrated sources. |
| **Downstream** | Review render, signing snapshot construction, recipient corpus reads. |

**Invariants:** INV-PARITY-01, INV-BOUNDARY-01, INV-BOUNDARY-02; ADR-011, ADR-018.

---

### 1.5 Review Session

| Field | Value |
|-------|-------|
| **Purpose** | Session-scoped invariant record tying premium generation marking to latched canonical and review display hashes for a single create/review session. |
| **Owner** | `paidProReviewSessionCorpusInvariantState.ts`. |
| **Lifetime** | Keyed by `reviewSessionId` or `claw_active_agreement_generation_id_v1`; per tab session. |
| **Persistence** | **T1 Module singleton** (`Map<sessionId, PaidReviewSessionCorpusInvariantRecord>`). |
| **Allowed mutations** | `markPaidReviewSessionPremiumGeneration`, latch hashes at freeze/first render; test-only reset. |
| **Consumers** | Pre-freeze assertions, diagnostic integrity, generation audit scope (TEST552). |
| **Upstream** | Generation completion, SoT hash at freeze. |
| **Downstream** | Parity diagnostics, canonical freeze guards. |

**Related:** Premium review route types (`premiumReviewRouteTypes.ts`), `paidProPremiumGenerationCallAudit.ts`.

---

### 1.6 Delivery Track

| Field | Value |
|-------|-------|
| **Purpose** | User's explicit product choice between **review-first send** (`"review"`) and **signature-first prep** (`"signature"`). |
| **Owner** | Derived in `proDeliveryTrackState.ts`; latch state in `AgreementBuilderIntake`. |
| **Lifetime** | From first review decision through send/signing prep; cleared on SoT teardown or explicit review-track pick. |
| **Persistence** | **T0 React** — `paidProSignaturePrepIntentLatched`, `signaturePreparationRequested`, `effectivePremiumSendMode`; not server-persisted as standalone field. |
| **Allowed mutations** | User pick via track chooser / sticky CTA; `resolveProDeliveryTrackSelected` is read-only derivation. |
| **Consumers** | Signer setup gating (TEST570), sticky CTA phases, send-for-review vs prepare-for-signing routing. |
| **Upstream** | Post-freeze review shell, `paidProReviewDefaultsToReviewTrack`. |
| **Downstream** | Inline signer setup, recipient setup phase, signature link generation. |

**Invariants:** INV-DEL-01, INV-DEL-02, INV-DEL-03; ADR-012, ADR-013.

---

### 1.7 Signing Packet (creator-side)

| Field | Value |
|-------|-------|
| **Purpose** | Immutable post-finalize signing corpus + signer manifests — the creator-side binding artifact before recipient handoff. Implemented as `AuthoritativeSigningSnapshot`. |
| **Owner** | `authoritativeSigningSnapshot.ts`. |
| **Lifetime** | Created on signer metadata finalize (green CTA); held until signing prep release or session teardown. |
| **Persistence** | **T1 Module singleton** (`authoritativeSigningSnapshot`, `authorityPhase`). |
| **Allowed mutations** | **Create once** on finalize; clear on explicit edit path or teardown. Notice hydration via allowed paths only (ADR-010). |
| **Consumers** | Signing prep UI, VS01 bridge, `readAuthoritativeSigningCorpus`, portable packet seed. |
| **Upstream** | Paid Pro SoT, `paidProSignerMetadataAuthority`, execution block hydration. |
| **Downstream** | Recipient session mint, VS01 signing render, fully executed artifact. |

```typescript
// authoritativeSigningSnapshot.ts — semantic core
type AuthoritativeSigningSnapshot = {
  corpus: string;
  signerMetadata: AuthoritativeSigningSnapshotRecipientMetadata;
  partyManifest: CanonicalFinalPartyManifest;
  signatureBlockModel: CanonicalSignerManifest;
  source: "paid_pro_signer_metadata_finalize";
  hash: string;
  frozenAt: number;
};
```

**Invariants:** INV-DEL-04, INV-DEL-05; ADR-005, ADR-009, ADR-014.  
**Note:** Distinct from CLAW protocol `sign_packet` (T5 proof) — creator snapshot feeds but does not replace proof attestation.

---

### 1.8 Recipient Session

| Field | Value |
|-------|-------|
| **Purpose** | Token-scoped access for a party to review or sign without full app auth. |
| **Owner** | Server recipient access policy; client validation via `recipientAccessApi.ts`. |
| **Lifetime** | Minted at send; TTL per server policy; consumed per visit. |
| **Persistence** | **T4 — Recipient token** (URL + server validation); `ValidatedRecipientAccess`. |
| **Allowed mutations** | Server: approve review, complete signature, audit events. Client: read-only render of bound corpus. |
| **Consumers** | `/review/:id`, `/sign/:id`, VS01 wizard, recipient intake QA surfaces. |
| **Upstream** | Agreement row, locked version id, mint from create flow send. |
| **Downstream** | Signature completed events, fully executed artifact, proof receipt inputs. |

**Invariants:** ADR-017; INV-ID-01 on recipient display.

---

### 1.9 Workspace

| Field | Value |
|-------|-------|
| **Purpose** | Org-scoped collection and lifecycle view of agreements (list rows, folders, tags, archive, completion flags). |
| **Owner** | `AppDashboard` + `agreementWorkspaceApi.ts`; server index. |
| **Lifetime** | Per authenticated org session; rows persist independently. |
| **Persistence** | **T3 Server** (agreement rows); **T2** `claw_authenticated_workspace_session` for client bootstrap. |
| **Allowed mutations** | Archive, folder/tag assignment, navigation to create; not SoT establishment. |
| **Consumers** | Dashboard UI, create entry (`paidDashboardCreateContext`), post-create navigation. |
| **Upstream** | Persisted agreements, Supabase fallback metadata when draft JSON missing. |
| **Downstream** | Dashboard paid-create marker, agreement detail, recipient status columns. |

**Types:** `WorkspaceIndexAgreement`, `WorkspaceIndexResult`.

---

### 1.10 Party

| Field | Value |
|-------|-------|
| **Purpose** | Legal entity slot on the agreement: name, role, notice address, optional review email, signature requirement flag. |
| **Owner** | Intake normalization (`partySlotIdentityNormalize.ts`); persisted on `AgreementDraft.parties`. |
| **Lifetime** | Defined at intake; stable indices critical for N-party render tokens. |
| **Persistence** | **T0** intake form; **T2** intake storage; **T3** `AgreementParty` on server. |
| **Allowed mutations** | Intake edit pre-freeze; post-freeze party **legal** identity changes require revision path — not signer typing. |
| **Consumers** | Render tokens, notice stanzas, execution block headings, signer slot assignment. |
| **Upstream** | User intake, labeled party block parse, smart defaults. |
| **Downstream** | Signer metadata slots (by index), notice hydration, workspace display. |

**Invariants:** INV-ID-02, INV-ID-04; ADR-008.

---

### 1.11 Signer

| Field | Value |
|-------|-------|
| **Purpose** | Human authorized to sign on behalf of a party — name, title, email distinct from party legal entity. |
| **Owner** | `paidProSignerMetadataAuthority.ts`, `signerSetupPartyIdentity.ts`. |
| **Lifetime** | Editable during signer setup; frozen into signing snapshot on finalize. |
| **Persistence** | **T0** inline form; **T1** consumed authority; **T3** sync on `AgreementParty.signerName` etc. after persist. |
| **Allowed mutations** | Dedicated signer setup paths only; execution block hydration; blocked contamination from party name (ADR-008). |
| **Consumers** | Execution block render, signing snapshot, recipient field assignment, VS01 signer marks. |
| **Upstream** | Party slot index, intake optional hints (never authoritative for entity). |
| **Downstream** | Authoritative signing snapshot, notice contact hydration, parity classification `signer_metadata_only`. |

**Types:** `PaidProSignerMetadataParty`, `AgreementParty.signerName|signerTitle|signerEmail`.

**Invariants:** INV-ID-01; ADR-008, ADR-009.

---

### 1.12 Execution Snapshot

**Terminology:** In LawDog docs, **Execution Snapshot** refers to the same creator-side object as **Signing Packet** — `AuthoritativeSigningSnapshot` after signer finalize, including hydrated execution block and notice fields.

| Field | Value |
|-------|-------|
| **Purpose** | Frozen signing-time view of corpus + manifests ready for signing prep and handoff. |
| **Owner** | `authoritativeSigningSnapshot.ts`. |
| **Lifetime** | Post-finalize until signing prep or edit. |
| **Persistence** | **T1 Module singleton**. |
| **Allowed mutations** | See §1.7; `isPostSignerMetadataFreezeActive()` gates edits. |
| **Consumers** | VS01, signing prep, parity vs SoT (allowed deltas). |
| **Upstream** | SoT + signer metadata finalize pipeline. |
| **Downstream** | Recipient signing, fully executed artifact. |

**Sub-structure (not separate domain objects):** execution block (`paidProExecutionBlockAuthority.ts`) — single block invariant INV-BOUNDARY-01.

---

### 1.13 Fully Executed Artifact

| Field | Value |
|-------|-------|
| **Purpose** | Post-signing document text with witness blocks, burned signatures, and per-signer dates — the completed agreement corpus. |
| **Owner** | `vs01FullyExecutedSignedSnapshot.ts`; server portable packet persistence. |
| **Lifetime** | Built when all required signatures complete; durable thereafter. |
| **Persistence** | **T3** (portable packet on agreement); **T5** binding inputs; optional **T2** `claw_paid_pro_vs01_post_sign_v1`. |
| **Allowed mutations** | Append-only signature overlays; no substantive clause rewrite. |
| **Consumers** | Download, proof display, workspace `completed_signed` flags, verifier UX. |
| **Upstream** | Signing packet corpus, `signature_completed` audit events, VS01 field placements. |
| **Downstream** | Proof receipts, timeline events, anchoring (CLAW protocol). |

```typescript
// vs01FullyExecutedSignedSnapshot.ts
type Vs01FullyExecutedSignedSnapshotV1 = {
  v: 1;
  corpusPlain: string;
  corpusHash: string;
  savedAt: string;
  signerRoleIds: string[];
};
```

**Invariants:** ADR-005; CLAW `SERVICE_BOUNDARIES.md` §1–2.

---

### 1.14 Proof objects

| Field | Value |
|-------|-------|
| **Purpose** | Deterministic attestations binding document bytes, signers, and timeline — outside LawDog UI choreography. |
| **Owner** | CLAW proof / receipt services (`docs/protocol/*`, `SERVICE_BOUNDARIES.md`). |
| **Lifetime** | Immutable once emitted. |
| **Persistence** | **T5 — Proof layer** (document `content_sha256`, `sign_packet`, `receipt_hash`, timeline append). |
| **Allowed mutations** | **None** (append-only new receipts/events). |
| **Consumers** | Verifier, anchoring, compliance exports. |
| **Upstream** | Fully executed artifact hash, locked document version from agreement service. |
| **Downstream** | Bitcoin anchoring, external verification. |

**LawDog rule:** Product code passes hashes and frozen corpora into proof paths; never LLM output post-freeze (ADR-007, repo ADR-002).

| Proof noun | Typical source |
|------------|----------------|
| Document bytes hash | Document service `content_sha256` |
| Sign attestation | Signature service `sign_packet` |
| Receipt | `receipt_hash` / receipt body v1 |
| Timeline event | Audit + protocol events |

---

### 1.15 Supporting metadata

Supporting objects are not agreement body but govern choreography, eligibility, and diagnostics.

| Object | Purpose | Owner module | Persistence |
|--------|---------|--------------|-------------|
| **Generation ID** | Tie one create attempt to server draft + audit scope | `agreementGenerationId.ts` | T2 `claw_active_agreement_generation_id_v1` |
| **Session markers** | Bootstrap context per flow (dashboard create, checkout, hero) | See root arch §5 | T2 sessionStorage |
| **Entitlement markers** | `pro_intent`, `pro_entitlement`, `free_starter` triad | `paidProSessionEligibility.ts` | T2 |
| **Premium completion snapshot** | Post-checkout generation resume payload | `premiumCompletionStorage.ts` | T2 |
| **UI latches** | Sticky intent (signer setup, signature track, finalize) | `AgreementBuilderIntake` | T0 React |
| **Generation call audit** | Scoped dedup of premium generation calls | `paidProPremiumGenerationCallAudit.ts` | T1 process-global |
| **Corpus lifecycle diff** | Classify allowed deltas between freeze points | `paidProCorpusLifecycleDiff.ts` | Pure / diagnostic |
| **Org context** | `claw_org_id` | `orgContext.ts` | T2 |
| **Entry context** | Cross-flow entry attribution | `lawdog_entry_context` | T2 |
| **VS01 bridge handoff** | Post-sign navigation state | `vs01PaidProPostSignHandoff.ts` | T2 |
| **Paid Pro review state** | `NOT_PAID \| GENERATING \| AUTHORITATIVE_READY \| FAILED_PREMIUM_CORPUS` | `paidProReviewStateMachine.ts` | Derived (read-only) |
| **Create flow phase** | `CreateFlowProductionPhase` | `createFlowTypes.ts` | T0 React |

**Invariants:** INV-BOOT-01–03; ADR-015.

---

## 2. Relationship diagrams

### 2.1 Ownership hierarchy (ASCII)

```
                    ┌──────────────┐
                    │  Workspace   │  (org index, T3)
                    └──────┬───────┘
                           │ 1:N
                    ┌──────▼───────┐
                    │  Agreement   │  (AgreementDraft, T3)
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  ┌──────▼──────┐   ┌──────▼──────┐   ┌─────▼─────┐
  │   Party     │   │   Draft     │   │  Audit /  │
  │  (slots)    │   │  family     │   │ versions  │
  └──────┬──────┘   └──────┬──────┘   └───────────┘
         │                 │
         │            ┌──────▼──────────┐
         │            │ Server full     │
         │            │ draft (transient)│
         │            └──────┬──────────┘
         │                   │ accept + freeze
         │            ┌──────▼──────────┐
         │            │ Paid Pro SoT    │  (T1, immutable)
         │            └──────┬──────────┘
         │                   │
         │            ┌──────▼──────────┐
         │            │ Canonical       │
         │            │ Snapshot        │  (T1, render gate)
         │            └──────┬──────────┘
         │                   │
  ┌──────▼──────┐     ┌──────▼──────────┐
  │   Signer    │────►│ Execution /     │
  │  metadata   │     │ Signing Snapshot│  (T1, post-finalize)
  └─────────────┘     └──────┬──────────┘
                             │ handoff
                      ┌──────▼──────────┐
                      │ Recipient       │
                      │ Session (T4)    │
                      └──────┬──────────┘
                             │ sign complete
                      ┌──────▼──────────┐
                      │ Fully Executed  │
                      │ Artifact (T3/5) │
                      └──────┬──────────┘
                             │
                      ┌──────▼──────────┐
                      │ Proof objects   │  (T5, immutable)
                      └─────────────────┘
```

### 2.2 Create-flow lifecycle (ASCII)

```
[Intake] ──► [Working Draft] ──► [Generation] ──► [Server full draft]
                                                      │
                                                      ▼
                                            [Pipeline accepted corpus]
                                                      │
                                                      ▼
                                            [Paid Pro SoT FREEZE]
                                                      │
                        ┌─────────────────────────────┼─────────────────────────────┐
                        ▼                             ▼                             ▼
                 [Review Session]            [Canonical Snapshot]          [Delivery Track]
                        │                             │                             │
                        └──────────────┬──────────────┘                             │
                                       ▼                                             │
                              [Review render + parity]                               │
                                       │                                             ▼
                                       │                                    [Signer setup]
                                       │                                             │
                                       │                                             ▼
                                       │                              [Execution Snapshot]
                                       │                                             │
                                       └────────────────────┬────────────────────────┘
                                                            ▼
                                                   [Agreement persist T3]
                                                            ▼
                                                   [Recipient Session]
                                                            ▼
                                                   [Fully Executed → Proof]
```

### 2.3 Delivery track vs signer latch (ASCII)

```
Post-freeze review
        │
        ▼
┌───────────────────┐
│ Delivery Track    │◄── paidProSignaturePrepIntentLatched (TEST577)
│ chooser (TEST570) │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
 "review"    "signature"
    │           │
    ▼           ▼
 send path   signer setup ──► finalize ──► paidProSignerMetadataFinalizedLatch
                                              (TEST575/576)
```

---

## 3. Object ownership matrix

| Object | Authoritative owner | Read-only consumers | Must not own |
|--------|--------------------|--------------------|--------------|
| Agreement | Server + `agreementWorkspaceApi` | Dashboard, recipient API, VS01 | Admin ops, starter shell |
| Working draft | `AgreementBuilderIntake` | Pipeline, intake storage | Recipient surfaces |
| Pipeline accepted corpus | `paidProPipelineAcceptedCorpus` | SoT establishment | Proof layer |
| Server full draft | Backend quality gate | `paidProCorpusAcceptance` | sessionStorage |
| Paid Pro SoT | `paidProSourceOfTruthState` | All paid render routers | Starter, recipient reinterpret |
| Canonical Snapshot | `canonicalAgreementSnapshot` | Review HTML, parity | User direct edit |
| Review Session | `paidProReviewSessionCorpusInvariantState` | Freeze guards, audit | Recipient token |
| Delivery Track | `proDeliveryTrackState` (derive) + Intake (latch) | Sticky CTA, signer gating | Server draft field |
| Signing / Execution Snapshot | `authoritativeSigningSnapshot` | VS01, signing prep | Working draft |
| Recipient Session | Server + `recipientAccessApi` | `/review`, `/sign` routes | Create SoT module |
| Workspace | Server index + `AppDashboard` | Create entry marker | SoT establishment |
| Party | Intake normalize + server `parties[]` | Render, notices | Signer authority alone |
| Signer | `paidProSignerMetadataAuthority` | Execution hydrate, VS01 | Party entity name |
| Fully Executed Artifact | `vs01FullyExecutedSignedSnapshot` + server | Proof, download | Create flow |
| Proof objects | CLAW proof/receipt services | Verifier | Any LLM module |
| Session markers | Per-flow owners (root §5) | Bootstrap readers | Foreign flow writers |

---

## 4. Mutation authority matrix

**Legend:** ✅ may mutate · 👁 read-only · 🚫 must not access for mutation · ⚠ create-once / clear-only

| Module | Agreement T3 | Working draft | SoT | Canonical snap | Signing snap | Party | Signer | Markers T2 |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `AgreementBuilderIntake` | ✅ persist | ✅ | ⚠ establish/clear | 👁 | ⚠ via finalize | ✅ pre-freeze | ✅ setup | 👁 |
| `paidProSourceOfTruth.ts` | 👁 | 👁 | ✅ establish | 👁 | 👁 | 👁 | 👁 | 👁 |
| `paidProSourceOfTruthState.ts` | 👁 | 🚫 | ✅ replace/clear | 👁 | 👁 | 🚫 | 🚫 | 🚫 |
| `canonicalAgreementSnapshot.ts` | 👁 | 🚫 | 👁 | ✅ build/freeze | 👁 | 👁 | 👁 | 🚫 |
| `authoritativeSigningSnapshot.ts` | 👁 | 🚫 | 👁 | 👁 | ✅ create/clear | 👁 | 👁 consume | 🚫 |
| `paidProSignerMetadataAuthority.ts` | 👁 | 🚫 | 🚫 | 🚫 | 👁 | 👁 | ✅ edit/consume | 🚫 |
| `premiumCompletionPipeline.ts` | 👁 | 👁 | 👁 | 🚫 | 🚫 | 👁 | 🚫 | 👁 |
| `paidProReviewSotParity.ts` | 🚫 | 🚫 | 👁 | 👁 | 👁 | 🚫 | 🚫 | 🚫 |
| `paidProDocumentBoundaryAuthority.ts` | 🚫 | 👁 | 👁 | ⚠ repair at freeze | 👁 | 👁 | 👁 | 🚫 |
| `proDeliveryTrackState.ts` | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| `recipientAccessApi` | 👁 | 🚫 | 🚫 | 🚫 | 🚫 | 👁 | 👁 | 🚫 |
| `vs01FullyExecutedSignedSnapshot` | 👁 | 🚫 | 🚫 | 👁 | 👁 | 👁 | 👁 | 🚫 |
| `newAgreementSessionReset` | 👁 | ⚠ clear | ⚠ clear | ⚠ clear | ⚠ clear | ⚠ clear | ⚠ clear | ✅ clear |
| `freeStarterReviewShell` | 👁 | 👁 starter | 🚫 | 🚫 | 🚫 | 👁 | 🚫 | 👁 |
| Proof / receipt services | 👁 hash only | 🚫 | 🚫 | 🚫 | 👁 bound input | 🚫 | 👁 attestation | 🚫 |

**Rules:**
- `proDeliveryTrackState.ts` is **pure** — no mutation of any corpus (ADR-012, ADR-013).
- Parity and lifecycle diff modules **classify and log**; they do not rewrite SoT (ADR-011, ADR-018).
- Recipient routes are **read-only** for agreement substance (ADR-017).

---

## 5. Persistence map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ T0 — React component state                                                   │
│   createFlowPhase, delivery track latches, inline signer form drafts        │
│   paidProInlineSignerSetupLatched, paidProSignerMetadataFinalizedLatch,     │
│   paidProSignaturePrepIntentLatched, signaturePreparationRequested          │
├─────────────────────────────────────────────────────────────────────────────┤
│ T1 — Module singleton (tab session, JS heap)                                 │
│   PaidProSourceOfTruth, AuthoritativeSigningSnapshot,                       │
│   frozen CanonicalAgreementSnapshot, pipeline accepted corpus,              │
│   PaidReviewSessionCorpusInvariantRecord, generation call audit ledger       │
├─────────────────────────────────────────────────────────────────────────────┤
│ T2 — sessionStorage                                                          │
│   Markers (§ root arch 5.1), generation id, entitlement, intake resume,     │
│   premium completion snapshot, VS01 bridge / post-sign handoff               │
├─────────────────────────────────────────────────────────────────────────────┤
│ T3 — Server draft / workspace                                                │
│   AgreementDraft, parties[], audit_log, versions, workspace metadata,       │
│   optional embedded document text fields, portable VS01 packet,             │
│   Vs01FullyExecutedSignedSnapshotV1 (persisted on agreement)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ T4 — Recipient artifacts                                                     │
│   URL token, ValidatedRecipientAccess, locked_version_id, mint policy       │
├─────────────────────────────────────────────────────────────────────────────┤
│ T5 — Final proof                                                             │
│   content_sha256, sign_packet, receipt_hash, immutable timeline append      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Per-object persistence

| Object | T0 | T1 | T2 | T3 | T4 | T5 |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|
| Agreement | | | | ✅ | | |
| Working draft | ✅ | | ✅ | | | |
| Pipeline accepted corpus | | ✅ | | | | |
| Server full draft | | | | ⚠ copy | | |
| Paid Pro SoT | | ✅ | | ⚠ mirror fields | | |
| Canonical Snapshot | | ✅ | | | | |
| Review Session | | ✅ | | | | |
| Delivery Track | ✅ | | | | | |
| Signing / Execution Snapshot | | ✅ | | ⚠ on sync | | |
| Recipient Session | | | | ✅ policy | ✅ | |
| Workspace index row | | | | ✅ | | |
| Party | ✅ | | ✅ | ✅ | 👁 | |
| Signer | ✅ | ✅ | | ✅ | 👁 | |
| Fully Executed Artifact | | | ⚠ handoff | ✅ | | ✅ input |
| Proof objects | | | | 👁 | | ✅ |
| Session markers | | | ✅ | | | |

⚠ = optional copy or handoff — not authoritative over T1 SoT when hashes disagree (root arch §6).

---

## 6. Cross-reference

### 6.1 Architecture decisions by object

| Object | ADRs |
|--------|------|
| Paid Pro SoT | 001, 004, 007 |
| Draft / generation | 006, 007 |
| Canonical Snapshot | 001, 011, 018 |
| Signing / Execution Snapshot | 005, 009, 010, 014 |
| Delivery Track | 002, 012, 013 |
| Party / Signer | 008, 009 |
| Agreement / Workspace | 003, 004 |
| Recipient Session | 005, 017 |
| Fully Executed / Proof | 005, 007 (repo ADR-002) |
| Session markers | 003, 015 |
| Admin | 016 |
| Parity / diagnostics | 010, 011, 018 |

### 6.2 System architecture sections

| Topic | Root doc section |
|-------|------------------|
| Product layers | §1 |
| Object summaries | §2 |
| Module dependencies | §3 |
| State machines & latches | §4 |
| Session markers | §5 |
| Persistence tiers | §6 |
| Invariants | §7 |

### 6.3 Invariant index by object

| Object | Invariant IDs |
|--------|---------------|
| Paid Pro SoT | INV-SOT-01, INV-SOT-02 |
| Canonical / parity | INV-PARITY-01, INV-PARITY-02, INV-BOUNDARY-01, INV-BOUNDARY-02 |
| Paid routing | INV-PAID-01 – INV-PAID-04 |
| Party / Signer | INV-ID-01 – INV-ID-04 |
| Delivery / signing | INV-DEL-01 – INV-DEL-05 |
| Generation | INV-GEN-01 – INV-GEN-03 |
| Bootstrap | INV-BOOT-01 – INV-BOOT-03 |

---

## 7. Screenflow usage (planned)

Child screenflow docs should reference objects by **name from §1** and link here:

```markdown
> **Domain model:** [LawDog Domain Model](../LAWDOG_DOMAIN_MODEL.md)  
> **Parent:** [LawDog System Architecture](../LAWDOG_SYSTEM_ARCHITECTURE.md)
```

Do not redefine SoT, canonical snapshot, delivery track, or signing snapshot in screenflow prose.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-07-08 | Initial canonical domain model — 15 core objects, supporting metadata, matrices, persistence map |
