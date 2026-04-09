# Privileged Workflow Hardening

## 1. Purpose

CLAW is **verifier-first** and **deterministic at the proof layer**. Legal-sensitive, attorney-client, trade-secret, and other **privileged-candidate** content requires a **protected workflow boundary** so that:

- Operational convenience (LLM assistance, analytics, logging) does not **waive** or **undermine** privilege claims.
- Confidential matter does not leak via **external model vendors**, **retention**, or **cross-matter** correlation.
- **Subpoena and discovery** exposure is bounded: systems must not accumulate **discoverable sprawl** of raw content in logs, traces, temp stores, or AI call history.
- Users and operators can rely on a **clear separation** between **what counts as evidence** and **what is advisory automation**.

This document is **implementation-driving**: it states normative boundaries and expected data flows so engineering can enforce them in code, configuration, and operations—not marketing positioning.

---

## 2. Threat Model

| Threat | Description |
|--------|-------------|
| **Raw privileged matter in AI workflows** | Users paste quotes, clauses, or facts from protected communications into prompts. If sent off-device or to external APIs **without** policy, redaction, and minimization, that is a **direct confidentiality and privilege risk**. |
| **Full documents / attachments to external AI** | Uploading PDFs, emails, or bundles to third-party models expands the **vendor trust surface**, **retention surface**, and **jurisdiction** ambiguity. Default behavior must not treat attachments as freely submittable model input. |
| **Over-retention in CLAW** | Logs, traces, analytics payloads, crash reports, queue dead-letters, and **temporary** object stores may retain **full bodies** longer than operators intend. Retention becomes **subpoena-friendly** and increases **discovery** burden. |
| **Cross-matter context bleed** | Session memory, RAG indices, prompt caches, or shared embeddings can associate **Matter A** content with **Matter B** queries, violating **matter isolation** and confidentiality obligations. |
| **AI outputs mistaken for evidence** | Summaries, drafts, or “suggested language” can be **confused** with signed artifacts, receipts, or chain-of-custody outputs if UX or APIs blur the line. That weakens **deterministic proof** semantics. |
| **Convenience storage as discoverable sprawl** | Debug dumps, “save for later” blobs, or operator-only buckets without TTL/classification become **unbounded archives** of sensitive content, unrelated to the **minimal** evidence needed for verification. |

---

## 3. Security Invariants

These rules are **normative** for legal-sensitive paths unless an **explicit, audited, user-visible** exception exists (see Allowed flows).

1. **No default externalization of raw privileged-candidate content**  
   Raw privileged-candidate content **must not** be sent to external AI **by default**.

2. **Policy gate before any AI-bound payload**  
   All content destined for an external (or operator-defined “AI”) endpoint **must** pass through: **policy check** → **redaction** → **minimization** (and optional local-only paths).

3. **AI outputs are advisory only**  
   Model output is **not** authoritative for facts, legal conclusions, or final terms unless a human has explicitly promoted it through a **non-automatic** workflow step.

4. **AI outputs excluded from automatic proof surfaces**  
   AI outputs **must never** be **hashed into** proofs, receipts, manifests, or evidence bundles **automatically**. Inclusion requires an **explicit** user-approved artifact boundary (see §5).

5. **Evidence domain ≠ AI domain**  
   The **evidence domain** (deterministic digests, verifier inputs, signed bundles) and the **AI domain** (prompts, completions, tool results) **must remain explicitly separated** in storage, APIs, and mental model.

6. **Metadata-only telemetry on sensitive paths**  
   CLAW logs and telemetry for designated sensitive workflows **must** be **metadata-only** (e.g., IDs, sizes, hashes of **non-content** labels, latency, outcome codes)—**not** raw prompt/response bodies.

7. **Matter-scoped isolation**  
   Sensitive workflows **require** **matter-scoped** isolation: no reuse of prompts, caches, indices, or session context across matters without an **explicit**, policy-gated mechanism.

---

## 4. Allowed vs Forbidden Data Flows

### Allowed

- **Evidence → local deterministic hashing / storage**  
  Canonical bytes digested and stored under existing proof/verification semantics **without** sending content to external AI.

- **Evidence → controlled extraction → policy → redaction → minimization → AI**  
  Structured or unstructured source material may feed AI **only** after automated or operator-configured **classification**, **redaction**, and **minimization** (e.g., excerpts, synthetic labels, entity-stripped snippets) per policy.

- **AI output → user review → explicit user-approved workflow artifact**  
  Model output may become a **draft** or **annotation** object that the user **explicitly** saves or approves; that object is **not** auto-merged into proof artifacts.

### Forbidden

- **Evidence → direct external AI**  
  No default path from evidentiary payloads to third-party model APIs without the airlock (policy, redaction, minimization).

- **Attachment → direct model submission**  
  No default uploading of full attachments to external models.

- **AI output → automatic proof / evidence inclusion**  
  No automatic hashing, signing, or bundling of model text into receipts, manifests, or evidence packages.

- **Cross-matter memory reuse**  
  No shared prompt context, embedding stores, or “global” RAG for sensitive matters unless explicitly designed and gated.

- **Raw prompt/response body logging**  
  No logging of full prompts or completions on sensitive paths; **metadata-only** logging applies.

---

## 5. Domain Separation

### Evidence Domain

**Role:** Holds **canonical**, **verifier-addressable** artifacts: deterministic hashes, signed bundles, receipt graphs, and whatever the proof layer needs to **recompute** or **verify** without nondeterministic steps.

**Rule:** Only **explicitly promoted**, **human- or system-approved** bytes belong here. **Never** auto-ingest LLM completions.

### Workflow Domain

**Role:** Application state: drafts, negotiation UI, task status, org/matter metadata, and **user-visible** workflow objects (including user-approved drafts derived from AI).

**Rule:** Workflow objects may reference evidence by **ID** and **digest**, not by shipping full privileged blobs into the wrong tier.

### AI Domain

**Role:** Ephemeral and **non-canonical** automation: prompts (post-airlock), completions, tool calls, and advisory UI. Treated as **replaceable** and **non-evidentiary** unless copied into workflow under user control.

**Rule:** No automatic bridge from AI Domain to Evidence Domain.

### Airlock Boundary

**Role:** The **only** legal gate between Workflow/Evidence raw material and AI Domain: **policy engine**, **redaction**, **minimization**, **allowlists** of fields, optional **local-only** model routes, and **audit metadata** (who/when/what policy version)—**without** logging raw bodies on sensitive paths.

**Rule:** Every external AI call for sensitive tiers **must** be attributable to a **policy decision record** (even if stored minimally: policy version + outcome).

---

## 6. Launch-Safe Implementation Phases

### Phase 1: Launch-safe minimum hardening

- Default **no external AI** for paths marked sensitive (feature flag + tenant/org policy).
- **Airlock** intercept for any LLM router path: block or strip on policy failure.
- **Safe logging**: metadata-only helpers; scrubber for accidental full-body logs.
- **Matter ID** threaded through AI/session boundaries; **no cross-matter** cache keys by default.
- UX: clear **“advisory only”** labeling; no AI-generated text in receipt/proof views unless explicitly user-placed.

### Phase 2: Enterprise / operator hardening

- Configurable **retention TTLs** for temp blobs, traces, and dead-letters; **no long-lived** raw AI payloads by default.
- **Operator dashboards** with redaction previews and export controls.
- Stronger **audit** (policy version, decision, outcome) without storing raw prompts on sensitive paths.
- Optional **data residency** routes (same-region-only vendors or local inference) as operator policy.

### Phase 3: Advanced privacy / local processing / future cryptographic hooks

- **On-prem or VPC** model endpoints; **local** extraction/redaction pipelines.
- **Confidential computing** or **client-side** encryption of content at rest (where product scope allows).
- **Cryptographic separation** experiments (e.g., distinct keys / manifests for evidence vs workflow advisory objects)—**future**; must not block Phase 1 clarity of domains.

---

## 7. Immediate Backend Workstreams

Concrete modules and capabilities likely required next (names illustrative; implementation may co-locate with existing routers/services **without** changing public contracts until designed):

| Workstream | Function |
|------------|----------|
| **Privilege / sensitivity policy engine** | Classifies requests, attachments, and org/matter tiers; yields allow/deny/redact-only outcomes and policy version IDs. |
| **AI airlock** | Single choke point before external LLM calls: enforce minimization, redaction, and block rules; attach non-content audit metadata. |
| **Redaction layer** | Pluggable redactors (regex, NER, structured field stripping) with testable profiles per sensitivity tier. |
| **Safe logging helper** | Central API for “log this event” that **refuses** or **strips** bodies on sensitive paths; standardizes metadata shape. |
| **Protected mode enforcement** | Middleware or service guard: sensitive flag → enforce airlock, logging rules, and evidence/AI separation at call sites. |
| **Matter-scoped ephemeral session boundary** | Session/cache keying, TTL-bound stores, and prohibition of cross-matter retrieval in the AI path. |

---

## 8. Non-Goals

- **CLAW does not provide legal advice.** Technical controls do not substitute for counsel or client decisions on privilege or waiver.
- **CLAW does not make definitive legal privilege determinations.** Policy flags are **operational and user/org-driven**, not a substitute for legal classification of specific communications.
- **AI output is not canonical evidence.** Only deterministic, explicitly promoted artifacts belong in the proof layer.
- **Enterprise hardening must not bloat ordinary user UX.** Default experiences for non-sensitive use remain simple; advanced controls are progressive disclosure or org-admin scoped.
