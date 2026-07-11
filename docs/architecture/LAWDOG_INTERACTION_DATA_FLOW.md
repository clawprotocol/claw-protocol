# LawDog Interaction & Data Flow

**Status:** Canonical interaction reference (authoritative for data movement)  
**Parent:** [LawDog System Architecture](./LAWDOG_SYSTEM_ARCHITECTURE.md)  
**See also:** [Domain Model](./LAWDOG_DOMAIN_MODEL.md) · [Architecture Decisions](./LAWDOG_ARCHITECTURE_DECISIONS.md)  
**Audience:** Engineers, QA, and agents writing screenflow docs or tracing object mutations  
**Last updated:** 2026-07-08

---

## Document role

| Document | Answers |
|----------|---------|
| [LAWDOG_SYSTEM_ARCHITECTURE.md](./LAWDOG_SYSTEM_ARCHITECTURE.md) | Layers, modules, state machines, markers |
| [LAWDOG_DOMAIN_MODEL.md](./LAWDOG_DOMAIN_MODEL.md) | What each object **is** |
| **This document** | How data **moves** — creation, transfer, freeze, persist, consume |
| `screenflows/*` (planned) | Entry-specific paths through these stages |

Screenflow children reference this file for lifecycle choreography and must not redefine gates or mutation rules.

---

## 1. End-to-end data lifecycle

Paid Pro create is the **reference path**. Starter/free branches exit before SoT freeze (ADR-006).

```
Stage          Object(s) produced / advanced          Tier    Gate
─────────────  ───────────────────────────────────────  ──────  ─────────────────────────
1 Intake       Party slots, ParsedDraftShape, markers   T0/T2   —
2 Draft        Working draft text                       T0      —
3 Generation   Server full draft (API response)         trans   entitlement + audit
4 Validation   Acceptance verdict, pipeline corpus      T1      quality + boundary
5 Freeze       Paid Pro SoT                             T1      ADR-001
6 Snapshot     Canonical snapshot                       T1      boundary authority
7 Review       Review session latch, review render      T1/T0   ADR-002, parity
8 Delivery     proDeliveryTrackSelected + latches       T0      ADR-012
9 Signer       Signer metadata authority                T0/T1   ADR-008, ADR-009
10 Signing     AuthoritativeSigningSnapshot             T1      finalize + parity
11 Persist      AgreementDraft (T3)                    T3      draft API
12 Recipient    ValidatedRecipientAccess, tokens         T4      mint + send
13 Executed    Vs01FullyExecutedSignedSnapshotV1        T3      all signatures
14 Proof        content_sha256, sign_packet, receipt     T5      CLAW protocol
```

### 1.1 Stage reference table

| Stage | Primary modules | Domain objects touched | Architecture § | ADRs |
|-------|-----------------|------------------------|----------------|------|
| Intake | `AgreementBuilderIntake`, `intakeSmartDefaults`, `agreementIntakeStorage` | Party, Working draft, markers | Root §1 L1, §5 | 003, 015 |
| Draft | Intake, `premiumCompletionStorage` | Working draft | Root §2.2, Domain §1.2a | — |
| Premium Generation | `premiumCompletionPipeline`, `paidProPremiumGenerationCallAudit` | Server full draft, pipeline corpus | Root §3 gen subgraph | 007 |
| Validation | `paidProCorpusAcceptance`, `paidProDocumentBoundaryAuthority`, backend gate | Acceptance verdict | Root §7 INV-GEN, INV-BOUNDARY | 007, 011 |
| Freeze | `paidProSourceOfTruth`, `paidProSotEstablishmentGate` | Paid Pro SoT | Root §2.3, §6 T1 | 001, 007 |
| Canonical Snapshot | `canonicalAgreementSnapshot` | Canonical snapshot | Root §2.4, Domain §1.4 | 001, 018 |
| Review Session | `paidProReviewSessionCorpusInvariantState`, `enterCanonicalPaidProReviewFlow` | Review session, review render | Root §2.8, §4.2 | 002, 011 |
| Delivery Track | `proDeliveryTrackState`, `AgreementBuilderIntake` | Delivery track, latches | Root §2.7, §4.3 | 012, 013 |
| Signer Setup | `signerSetupPartyIdentity`, `paidProSignerMetadataAuthority` | Signer | Domain §1.11 | 008, 009, 012 |
| Signing Packet | `authoritativeSigningSnapshot` | Signing / Execution snapshot | Root §2.5, Domain §1.7 | 005, 009, 014 |
| Recipient Session | `recipientAccessApi`, `/review`, `/sign` | Recipient session | Root §2.9 L5 | 017 |
| Execution Snapshot | Same module as signing packet (post-finalize) | Execution snapshot | Domain §1.12 | 010, 014 |
| Fully Executed | `vs01FullyExecutedSignedSnapshot` | Fully executed artifact | Domain §1.13 | 005 |
| Proof | CLAW document/signature/receipt services | Proof objects | Root §9, Domain §1.14 | 004, 005, 007 |

---

## 2. ASCII sequence diagrams

### 2.1 Master sequence — paid Pro create to proof

```
Actor          Intake      Pipeline      Validation    SoT/Freeze    Review       Signer       Signing      Server       Recipient     Proof
  │               │            │              │             │           │            │            │            │             │           │
  │──submit──────►│            │              │             │           │            │            │            │             │           │
  │               │──draft────►│              │             │           │            │            │            │             │           │
  │               │            │──POST gen───►│             │           │            │            │            │             │           │
  │               │            │◄─full draft──│             │           │            │            │            │             │           │
  │               │            │              │──accept───►│           │            │            │            │             │           │
  │               │            │              │             │──freeze──►│           │            │            │             │           │
  │               │            │              │             │──snapshot►│           │            │            │             │           │
  │◄─review UI──────────────────────────────────────────────│           │            │            │            │             │           │
  │──track pick────────────────────────────────────────────►│           │            │            │            │             │           │
  │──signer meta────────────────────────────────────────────────────────►│            │            │            │             │           │
  │──finalize───────────────────────────────────────────────────────────────────────►│            │            │             │           │
  │               │            │              │             │           │            │──snapshot─►│            │             │           │
  │──persist─────────────────────────────────────────────────────────────────────────────────────►│            │             │           │
  │──send/mint───────────────────────────────────────────────────────────────────────────────────►│            │             │           │
  │               │            │              │             │           │            │            │            │──token─────►│           │
  │  (recipient signs)         │              │             │           │            │            │            │             │──event───►│
  │               │            │              │             │           │            │            │            │             │           │──receipt
```

**Ownership transfer highlights:**
- Working draft **owned by** Intake until generation consumes it.
- Server full draft **owned by** validation; on accept, ownership transfers to freeze path (not retained as mutable draft).
- SoT **owned by** `paidProSourceOfTruthState` — pipeline and working draft become read-only fallbacks.
- Signing snapshot **owned by** `authoritativeSigningSnapshot` after finalize; SoT remains immutable anchor for parity.

### 2.2 Intake → Draft → Generation

```
User          AgreementBuilderIntake    intakeStorage(T2)    premiumCompletionPipeline    Backend API
 │                      │                        │                        │                    │
 │──type intake────────►│                        │                        │                    │
 │                      │──write marker─────────►│                        │                    │
 │                      │──ParsedDraftShape──────│ (T0)                   │                    │
 │──Create Draft───────►│                        │                        │                    │
 │                      │──runPremiumCompletion──┼───────────────────────►│                    │
 │                      │                        │                        │──premium_full_draft►│
 │                      │                        │                        │◄──document_text────│
 │                      │                        │◄──response─────────────│                    │
 │                      │──mark pipeline corpus──►│ (T1)                   │                    │
```

**Refs:** Domain §1.2; Root §4.1 `generating_draft`; ADR-007.

### 2.3 Validation → Freeze → Canonical Snapshot

```
premiumCompletionPipeline   paidProCorpusAcceptance   paidProDocumentBoundaryAuthority   paidProSourceOfTruth   canonicalAgreementSnapshot
            │                          │                              │                            │                        │
            │──corpus body────────────►│                              │                            │                        │
            │                          │──validate───────────────────►│                            │                        │
            │                          │◄──pass / fail────────────────│                            │                        │
            │                          │──establish (on pass)──────────┼───────────────────────────►│                        │
            │                          │                              │                            │──replacePaidProSoT────►│ (T1)
            │                          │                              │                            │──build snapshot───────►│
            │                          │                              │                            │                        │──freeze registry
```

**Gate:** Validation → Freeze is **one-way**; failed validation does not establish SoT (routes to `FAILED_PREMIUM_CORPUS`, ADR-006).

**Refs:** INV-SOT-01, INV-BOUNDARY-02; ADR-001, ADR-011.

### 2.4 Freeze → Review → Delivery Track

```
establishPaidProSourceOfTruth   enterCanonicalPaidProReviewFlow   paidProReviewStateMachine   proDeliveryTrackState   AgreementBuilderIntake
              │                              │                              │                        │                        │
              │──SoT ready──────────────────►│                              │                        │                        │
              │                              │──AUTHORITATIVE_READY──────────►│                        │                        │
              │                              │──review shell────────────────┼────────────────────────┼───────────────────────►│
User          │                              │                              │                        │                        │
 │──view doc──┼──────────────────────────────┼──────────────────────────────┼────────────────────────┼───────────────────────►│
 │──pick track┼──────────────────────────────┼──────────────────────────────┼───────────────────────►│                        │
 │            │                              │                              │                        │──latch intent─────────►│ (T0)
```

**Gate:** Review → Signer Setup requires explicit delivery track (TEST570, ADR-012). Review precedes signing (ADR-002).

### 2.5 Signer Setup → Signing Packet → Persist

```
signerSetupPartyIdentity   paidProSignerMetadataAuthority   authoritativeSigningSnapshot   paidProReviewSotParity   agreementWorkspaceApi
            │                            │                              │                            │                        │
User        │                            │                              │                            │                        │
 │──edit────►│                            │                              │                            │                        │
 │           │──update authority─────────►│ (T0/T1)                      │                            │                        │
 │──finalize►│                            │                              │                            │                        │
 │           │──consume metadata──────────┼─────────────────────────────►│                            │                        │
 │           │                            │                              │──create snapshot (once)───►│                        │
 │           │                            │                              │                            │──audit parity──────────►│
 │           │                            │                              │                            │                        │
 │──persist──┼────────────────────────────┼──────────────────────────────┼────────────────────────────┼───────────────────────►│
 │           │                            │                              │                            │                        │──AgreementDraft T3
```

**Gate:** Signer Setup → Signing requires finalize + allowed parity delta (ADR-009, ADR-010, TEST576).

### 2.6 Signing → Recipient → Execution → Proof

```
authoritativeSigningSnapshot   recipientAccessApi   /sign route   vs01FullyExecutedSignedSnapshot   receipt_service (T5)
              │                        │                  │                    │                            │
              │──corpus hash───────────┼──mint token─────►│                    │                            │
              │                        │                  │──validate token───►│                            │
Recipient     │                        │                  │◄──bound corpus─────│                            │
 │──sign──────┼────────────────────────┼──────────────────┼───────────────────►│                            │
              │                        │                  │                    │──signature_completed──────►│ (audit T3)
              │                        │                  │                    │──build executed snapshot──►│
              │                        │                  │                    │                            │──sign_packet
              │                        │                  │                    │                            │──receipt_hash
```

**Gate:** Signing → Execution is one-way overlay; Execution → Proof is append-only (ADR-005, ADR-017).

---

## 3. Per-object lifecycle actors

For each core object: **created by · mutated by · frozen by · persisted by · consumed by · archived by · forbidden consumers**.

### 3.1 Intake (stage artifact — not a persisted object)

| Actor | Module / flow |
|-------|---------------|
| **Created by** | User input, hero prefill (`claw_hero_intake_prefill_v1`), dashboard metadata prefill |
| **Mutated by** | `AgreementBuilderIntake`, `intakeSmartDefaults`, party normalization |
| **Frozen by** | Submit to generation (`createFlowPhase` → `generating_draft`) |
| **Persisted by** | `agreementIntakeStorage` (T2), optional fields copied to T3 on agreement persist |
| **Consumed by** | `premiumCompletionPipeline`, render token fallback (TEST564–566) |
| **Archived by** | `newAgreementSessionReset` (clear markers) |
| **Forbidden** | Recipient routes re-deriving intake as authoritative corpus (ADR-017) |

### 3.2 Draft (working)

| Actor | Module / flow |
|-------|---------------|
| **Created by** | Intake submit, generation in-flight UI |
| **Mutated by** | Intake edits pre-submit only |
| **Frozen by** | SoT establishment — body no longer authoritative |
| **Persisted by** | T2 completion snapshot (resume only); not proof |
| **Consumed by** | Generation request builders, pipeline |
| **Archived by** | Session reset, SoT replace |
| **Forbidden** | VS01, proof, paid review render post-freeze (ADR-005, ADR-006) |

### 3.3 Server full draft (transient)

| Actor | Module / flow |
|-------|---------------|
| **Created by** | Backend `premium_full_draft` + quality gate |
| **Mutated by** | None after response |
| **Frozen by** | `paidProCorpusAcceptance` accept path |
| **Persisted by** | Optional copy into `AgreementDraft` text fields (T3) |
| **Consumed by** | `establishPaidProSourceOfTruth` |
| **Archived by** | Superseded by next generation attempt |
| **Forbidden** | Direct recipient render without acceptance (ADR-007) |

### 3.4 Paid Pro Source of Truth

| Actor | Module / flow |
|-------|---------------|
| **Created by** | `establishPaidProSourceOfTruth` |
| **Mutated by** | `replacePaidProSourceOfTruth` at establishment/clear only |
| **Frozen by** | Itself at establishment (immutable, ADR-001) |
| **Persisted by** | Not directly — mirrored fields may copy to T3 |
| **Consumed by** | Review render, parity, canonical snapshot, signing snapshot input |
| **Archived by** | `clearPaidProSourceOfTruth`, `newAgreementSessionReset` |
| **Forbidden** | Starter shell, LLM post-freeze, recipient reinterpret (ADR-006, ADR-007, ADR-017) |

### 3.5 Canonical Snapshot

| Actor | Module / flow |
|-------|---------------|
| **Created by** | `buildCanonicalAgreementSnapshot` at freeze |
| **Mutated by** | Rebuild on surface read (not user edit); display normalization via classified deltas |
| **Frozen by** | `getFrozenCanonicalAgreementCorpus` registry |
| **Persisted by** | T1 only |
| **Consumed by** | Review HTML, parity expected hash, `readCanonicalAgreementCorpusForSurface` |
| **Archived by** | SoT clear, session reset |
| **Forbidden** | User WYSIWYG edit; starter tier as SoT substitute |

### 3.6 Review Session

| Actor | Module / flow |
|-------|---------------|
| **Created by** | `paidProReviewSessionCorpusInvariantState` on first mark |
| **Mutated by** | `markPaidReviewSessionPremiumGeneration`, hash latches at freeze/first render |
| **Frozen by** | Latched hashes after first successful review render |
| **Persisted by** | T1 module map keyed by generation/review session id |
| **Consumed by** | Pre-freeze guards, TEST552 audit scope |
| **Archived by** | Test reset; tab close |
| **Forbidden** | Recipient token validation |

### 3.7 Delivery Track

| Actor | Module / flow |
|-------|---------------|
| **Created by** | User pick on review chooser (default review, ADR-012) |
| **Mutated by** | `AgreementBuilderIntake` latches; `resolveProDeliveryTrackSelected` derives |
| **Frozen by** | `paidProSignaturePrepIntentLatched` through signer setup (ADR-013) |
| **Persisted by** | T0 React only |
| **Consumed by** | Signer setup gating, sticky CTA, send vs prep routing |
| **Archived by** | Review track re-pick, SoT teardown |
| **Forbidden** | Server draft field write; auto-arm before user choice (INV-DEL-01) |

### 3.8 Signer (metadata)

| Actor | Module / flow |
|-------|---------------|
| **Created by** | `paidProSignerMetadataAuthoritySeed`, user typing in signer setup |
| **Mutated by** | `paidProSignerMetadataAuthority`, `signerSetupPartyIdentity` during setup/edit |
| **Frozen by** | Finalize → consumed into signing snapshot |
| **Persisted by** | T3 `AgreementParty.signer*` on draft sync |
| **Consumed by** | Execution block hydration, signing snapshot, VS01 field assignment |
| **Archived by** | Session reset; superseded by explicit Edit path |
| **Forbidden** | Party slot entity name inference (ADR-008); frozen SoT body rewrite (ADR-009) |

### 3.9 Signing Packet / Execution Snapshot

| Actor | Module / flow |
|-------|---------------|
| **Created by** | `authoritativeSigningSnapshot` on finalize (green CTA) |
| **Mutated by** | Clear on Edit or teardown only; notice hydration via allowed paths |
| **Frozen by** | `isPostSignerMetadataFreezeActive()` |
| **Persisted by** | T1; portable packet seed to T3 |
| **Consumed by** | Signing prep, VS01, recipient mint corpus binding |
| **Archived by** | Session reset |
| **Forbidden** | Working draft, starter preview, pre-finalize review-only render as signing source (ADR-005) |

### 3.10 Agreement (persisted)

| Actor | Module / flow |
|-------|---------------|
| **Created by** | Draft persist API from create flow |
| **Mutated by** | Workspace API, audit append, review_sent_at, archive/tags |
| **Frozen by** | `locked_version_id` when signing lock engaged (server) |
| **Persisted by** | T3 server |
| **Consumed by** | Dashboard, recipient mint, VS01 seed, proof hash lookup |
| **Archived by** | `workspace_archived_at` |
| **Forbidden** | Admin ops as create SoT (ADR-016); client-only heap as proof (ADR-004) |

### 3.11 Recipient Session

| Actor | Module / flow |
|-------|---------------|
| **Created by** | `recipientAccessApi` mint on send |
| **Mutated by** | Server: approval, signature completion events |
| **Frozen by** | Bound `locked_version_id` + corpus hash at mint |
| **Persisted by** | T4 token + server policy store |
| **Consumed by** | `/review/:id`, `/sign/:id`, VS01 wizard |
| **Archived by** | TTL expiry, revocation (server policy) |
| **Forbidden** | Create-flow SoT module, intake re-derive (ADR-017) |

### 3.12 Fully Executed Artifact

| Actor | Module / flow |
|-------|---------------|
| **Created by** | `buildFullyExecutedSignedSnapshot` when signatures complete |
| **Mutated by** | Append signature overlays only |
| **Frozen by** | Snapshot hash at completion |
| **Persisted by** | T3 portable packet; T5 binding input |
| **Consumed by** | Download, verifier, workspace `completed_signed` |
| **Archived by** | Retention policy (server) |
| **Forbidden** | LLM rewrite; create-flow edit |

### 3.13 Proof objects

| Actor | Module / flow |
|-------|---------------|
| **Created by** | CLAW document + signature + receipt services |
| **Mutated by** | None (append new receipts/events only) |
| **Frozen by** | At emission |
| **Persisted by** | T5 immutable stores |
| **Consumed by** | Verifier, anchoring, compliance export |
| **Archived by** | Protocol retention |
| **Forbidden** | LLM modules, starter corpus, mutable session heap (ADR-007, repo ADR-002) |

---

## 4. Mutation choreography matrix

**Operations:** **C**reate · **R**ead · **U**pdate · **F**reeze · **D**erive · **P**ersist · **C**onsume · **A**rchive

| Module | Intake | Draft | Validation | SoT | Canon snap | Review sess | Delivery | Signer | Signing snap | Agreement T3 | Recipient | Executed | Proof |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `AgreementBuilderIntake` | C U | C U | R | R | R | R | C U D | C U | R | P | R | R | — |
| `premiumCompletionPipeline` | R | R U | C | R | — | C | — | — | — | R | — | — | — |
| `paidProCorpusAcceptance` | R | R | C U | R | — | — | — | — | — | — | — | — | — |
| `paidProDocumentBoundaryAuthority` | R | R | C | R | F | — | — | R | R | — | — | — | — |
| `paidProSourceOfTruth` | — | R | R | C F | R | R | — | — | R | R | — | — | — |
| `canonicalAgreementSnapshot` | R | — | R | R | C F D | R | — | R | R | — | R | R | — |
| `paidProReviewSessionCorpusInvariantState` | — | — | R | R | R | C U F | — | — | — | — | — | — | — |
| `enterCanonicalPaidProReviewFlow` | R | R | R | R | R | U | D | R | R | R | — | — | — |
| `proDeliveryTrackState` | — | — | — | — | — | — | D | — | — | — | — | — | — |
| `signerSetupPartyIdentity` | R | — | — | R | R | — | D | C U | R | — | — | — | — |
| `paidProSignerMetadataAuthority` | R | — | — | — | — | — | — | C U F | R | P | — | — | — |
| `authoritativeSigningSnapshot` | — | — | — | R | R | — | — | R | C F | P | C | R | — |
| `paidProReviewSotParity` | R | — | — | R | R | R | — | R | R | — | — | — | — |
| `paidProCorpusLifecycleDiff` | — | — | — | R | R | — | — | R | R | — | — | R | — |
| `agreementWorkspaceApi` | R | R | — | R | — | — | — | U | R | C U P A | R | R | R |
| `recipientAccessApi` | — | — | — | — | R | — | — | R | R | R | C R | R | — |
| `vs01FullyExecutedSignedSnapshot` | — | — | — | — | R | — | — | R | R | P | C | C F | C |
| Proof / receipt services | — | — | — | — | — | — | — | R | R | R | R | R | C |

**Legend:** — = no interaction · Derive = pure computation, no corpus mutation · Freeze = immutability boundary applied

---

## 5. One-way architectural gates

Each gate is **forward-only**. Reverse transitions require explicit teardown, revision, or new generation — never silent downgrade.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   DRAFT     │────►│ VALIDATION  │────►│   FREEZE    │────►│   REVIEW    │
│  (mutable)  │     │ (accept/    │     │ (SoT +      │     │ (authoritative
│             │     │  reject)    │     │  snapshot)  │     │  render)    │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
       ▲                  │ fail closed                         │
       │                  ▼                                       ▼
       │           FAILED_PREMIUM_CORPUS              ┌─────────────────┐
       │           (recover, not starter)             │ DELIVERY TRACK  │
       │                                              │ (explicit pick) │
       │                                              └────────┬────────┘
       │                                                       ▼
       │                                              ┌─────────────────┐
       │                                              │ SIGNER SETUP    │
       │                                              │ (metadata only) │
       │                                              └────────┬────────┘
       │                                                       ▼
       │                                              ┌─────────────────┐
       │                                              │ SIGNING PACKET  │
       │                                              │ (finalize)      │
       │                                              └────────┬────────┘
       │                                                       ▼
       │                                              ┌─────────────────┐     ┌─────────────┐
       │                                              │ RECIPIENT       │────►│  EXECUTION  │
       │                                              │ SESSION         │     │  SNAPSHOT   │
       │                                              └────────┬────────┘     └──────┬──────┘
       │                                                       │                       ▼
       │                                                       │                ┌─────────────┐
       │                                                       └───────────────►│   PROOF     │
       │                                                                        │ (immutable) │
       │                                                                        └─────────────┘
       │
       └── explicit revision / new session only (newAgreementSessionReset, re-generation)
```

### 5.1 Gate specifications

| Gate | From → To | Enforcing modules | Pass condition | Fail-closed behavior |
|------|-----------|-------------------|----------------|---------------------|
| **G1** Draft → Validation | Working/server draft → acceptance | `paidProCorpusAcceptance`, backend quality gate | Substance, boundary, token scan pass | `FAILED_PREMIUM_CORPUS`; no SoT (INV-PAID-01) |
| **G2** Validation → Freeze | Accept → SoT | `paidProSourceOfTruth`, `paidProSotEstablishmentGate` | `server_full_draft` accepted; audit marked | No freeze; hold GENERATING (INV-GEN-01) |
| **G3** Freeze → Review | SoT → review UI | `enterCanonicalPaidProReviewFlow`, `paidProReviewStateMachine` | `AUTHORITATIVE_READY`, body len > 0 | Block render; recovery UI (INV-PAID-03) |
| **G4** Review → Signer Setup | Review → inline signer | `signerSetupPartyIdentity`, delivery track | User picked track; TEST570 chooser done | Do not arm `paidProInlineSignerSetupLatched` (INV-DEL-01) |
| **G5** Signer Setup → Signing | Metadata → snapshot | `authoritativeSigningSnapshot` | Finalize + parity allowed delta | Hold edit state; no fail-downgrade (INV-PAID-04) |
| **G6** Signing → Recipient | Snapshot → token | `recipientAccessApi`, send flow | Persist + mint policy OK | Block send; no starter corpus substitute |
| **G7** Signing → Execution Snapshot | Creator snapshot → same freeze | `authoritativeSigningSnapshot` | Finalize complete | Re-arm loop blocked (INV-DEL-05, ADR-014) |
| **G8** Execution → Proof | Executed artifact → receipt | CLAW services | All required signatures; hash match | No receipt without bound hash (ADR-005) |

### 5.2 Gate cross-references

| Gate | ADRs | Invariants | Domain § | Root § |
|------|------|------------|----------|--------|
| G1 | 006, 007 | INV-GEN-01–03, INV-PAID-01 | 1.2c | 3 gen, 7.5 |
| G2 | 001, 007 | INV-SOT-01–02 | 1.3 | 2.3, 6 |
| G3 | 002, 011 | INV-PARITY-01, INV-PAID-03 | 1.4–1.5 | 4.2 |
| G4 | 012, 013 | INV-DEL-01, INV-DEL-03 | 1.6 | 4.3–4.4 |
| G5 | 009, 010, 014 | INV-DEL-04–05, INV-ID-01 | 1.11–1.12 | 2.5 |
| G6 | 017, 004 | — | 1.8, 1.10 | 2.9 |
| G7 | 014 | INV-DEL-05 | 1.12 | 4.4 |
| G8 | 005, 004 | — | 1.13–1.14 | 9 |

---

## 6. Fail-closed behavior and forbidden transitions

### 6.1 Fail-closed catalog

| Condition | System response | Never does | ADR | Invariant |
|-----------|-----------------|------------|-----|-----------|
| Post-checkout, no valid corpus | `FAILED_PREMIUM_CORPUS` recovery | Degrade to starter | 006 | INV-PAID-01 |
| `authoritativeBodyLen === 0` | Hold GENERATING / block AUTHORITATIVE_READY | Empty review render | — | INV-PAID-03 |
| Signer typing in flight | Hold AUTHORITATIVE_READY | Fail to FAILED_PREMIUM_CORPUS | 009 | INV-PAID-04 |
| Parity mismatch, unclassified delta | Log / block boundary paths | Silent forgive | 011 | INV-PARITY-01 |
| Unresolved render tokens at freeze | `blockOnViolation` throw | Freeze with tokens | 011 | INV-BOUNDARY-02 |
| Duplicate generation audit (wrong scope) | Short-circuit network | Empty fallback as authoritative | 007 | INV-GEN-01 |
| Signature track during signer setup | Latch preserves track | Revert to review default | 013 | INV-DEL-03 |
| Post-finalize stale inline latch | Advance to prep | Re-open signer setup | 014 | INV-DEL-05 |
| Recipient reads create session | Token validation only | Re-derive from intake | 017 | — |
| Diagnostic parity log | `console.info` only | Block UX (by design) | 018 | — |

### 6.2 Forbidden transitions (hard)

| # | Forbidden transition | Why | ADR |
|---|---------------------|-----|-----|
| F1 | Starter preview → paid authoritative review | Tier isolation | 006 |
| F2 | SoT in-place text edit | Immutability | 001 |
| F3 | Party entity name → signer slot | Contamination | 008 |
| F4 | Signer edit → frozen SoT body rewrite | Dedicated paths only | 009 |
| F5 | LLM output → post-freeze signing corpus | Proof boundary | 007 |
| F6 | Review skip → signer setup (dashboard) | Explicit delivery intent | 012 |
| F7 | sessionStorage corpus → proof input | ADR-004 | 004 |
| F8 | Admin surface → establish SoT | Ops not create SoT | 016 |
| F9 | Unclassified notice change → parity pass | Substance vs hydration | 010 |
| F10 | GENERATING → NOT_PAID after checkout | Fail closed paid | 006 |

### 6.3 Allowed reverse paths (explicit only)

| Transition | Trigger | Module |
|------------|---------|--------|
| SoT clear | `newAgreementSessionReset`, teardown effect | `paidProSourceOfTruthState` |
| Signer re-edit | User clicks "Edit signer details" (guarded) | `AgreementBuilderIntake`, ADR-014 |
| New generation | User recovery / retry after FAILED_PREMIUM_CORPUS | `premiumCompletionPipeline` |
| Delivery track revert | User picks review track | Clears `paidProSignaturePrepIntentLatched` |
| Archive agreement | Workspace archive action | `agreementWorkspaceApi` |

---

## 7. Persistence flow map

```
                    CREATE          FREEZE           PERSIST          HANDOFF           PROOF
                      │               │                │                │                │
Intake/T2 markers ────┤               │                │                │                │
Working draft T0 ─────┤               │                │                │                │
Pipeline corpus T1 ───┼──► SoT T1 ───┤                │                │                │
Server response ──────┘   Canon T1 ───┤                │                │                │
                          Review T1 ──┤                │                │                │
                          Latches T0 ─┤                │                │                │
                          Signer T0/T1─┼──► Snap T1 ───┼──► Agree T3 ────┼──► Token T4 ───┼──► T5
                          Parity log ─┘                │                │                │
                                                       │                Executed T3 ───┘
```

**Rule:** When T1 SoT and T2/T3 copies disagree on hash, **T1 SoT wins** for in-create authority (Root §6, Domain §5).

---

## 8. Cross-reference index

### 8.1 Lifecycle stage → documents

| Stage | System Architecture | Domain Model | ADRs |
|-------|--------------------|--------------|------|
| Intake | §1 L1, §5 markers | §1.2a, §1.10, §1.15 | 003, 015 |
| Draft | §2.2, §4.1 | §1.2 | — |
| Generation | §3 gen, §4.1 | §1.2b–c | 007 |
| Validation | §3, §7 INV-GEN/BOUNDARY | §1.2c | 007, 011 |
| Freeze | §2.3, §6 T1 | §1.3 | 001 |
| Snapshot | §2.4 | §1.4 | 001, 018 |
| Review | §4.2–4.3 | §1.5–1.6 | 002, 011 |
| Delivery | §4.3–4.4 | §1.6 | 012, 013 |
| Signer | §2.6 | §1.11 | 008, 009 |
| Signing | §2.5 | §1.7, §1.12 | 005, 014 |
| Persist | §6 T3 | §1.1 | 004 |
| Recipient | §1 L5, §2.9 | §1.8 | 017 |
| Executed | §9 boundary | §1.13 | 005 |
| Proof | §9 | §1.14 | 004, 007 |

### 8.2 Screenflow usage (planned)

```markdown
> **Data flow:** [LawDog Interaction & Data Flow](../LAWDOG_INTERACTION_DATA_FLOW.md)  
> **Domain model:** [LawDog Domain Model](../LAWDOG_DOMAIN_MODEL.md)  
> **Parent:** [LawDog System Architecture](../LAWDOG_SYSTEM_ARCHITECTURE.md)
```

---

## Revision history

| Date | Change |
|------|--------|
| 2026-07-08 | Initial interaction & data flow — lifecycle, sequences, gates, mutation matrix, fail-closed catalog |
