# CLAW Verifier UX — v1

Status: Capability Spec · Read-Only · Non-Advisory · No Determinations

---

## 1. Purpose

The Verifier UX is a read-only interface for verifying timeline events and derived outputs.
It MUST NOT provide legal advice, adjudication, enforcement, or outcome recommendations.

---

## 2. Core Objects

- Timeline (immutable event ledger)
- Event (timestamped record)
- Receipt / Proof (verifiable integrity artifacts)
- Liability Assessment (derived classification output)
- Determination Clause Output (if shown, compute-only; never prescriptive)

---

## 3. Required Capabilities (v1)

### 3.1 Timeline Selection
- Enter `timeline_id`
- List timeline metadata (created_at, protocol version, network context if applicable)
- List event count

### 3.2 Event Browsing
- Paginated list of events
- Sort order:
  - event_time DESC
  - created_at DESC
- Filter by `event_type`

### 3.3 View Event Details
- Show canonical event JSON (read-only)
- Show event hash / canonical digest (if defined)
- Show event provenance fields (who/role, capacity, time window, control/access) if present

### 3.4 Liability State (Latest)
- Fetch latest liability assessment via:
  - GET /v1/timelines/{timeline_id}/liability/latest
- Display:
  - timeline_id
  - event_id
  - assessment.schema_version
  - assessment.assessment_time
  - assessment.tags[]
  - assessment.flags[]
  - assessment.warnings[]
- MUST NOT display raw user attestation text in the liability view

### 3.5 Liability State (At Time T)
- Inputs:
  - timeline_id
  - target timestamp T
- Output:
  - latest liability assessment whose underlying attested event is <= T
- Display same fields as “Latest”

### 3.6 Diff Two Liability States
- Inputs:
  - (event_id A) and (event_id B) OR (time A, time B)
- Output:
  - tags added/removed
  - flags added/removed
  - warnings added/removed
- Diff MUST be purely structural (no explanation or conclusions)

### 3.7 Export
- Export assessment JSON exactly as returned by API
- Export diff JSON (structural changes only)
- Export verification bundle (if supported): receipt/proof artifacts needed for independent verification

---

## 4. Explicit Non-Goals (v1)

- No advice, recommendations, or “next steps”
- No scoring, probabilities, or risk percentages
- No jurisdictional analysis
- No compliance determinations
- No enforcement actions
- No automated outcome execution

---

## 5. Display Rules (v1)

- Always label derived objects as “classification output”
- Always label timelines/events as “user-provided attestations”
- Always provide “verify independently” affordance (export / verifier tool link path)

---

## 6. Audit / Traceability (v1)

- Any displayed liability assessment MUST include:
  - source event_id
  - assessment_time
  - schema_version
- Any diff MUST include:
  - both source identifiers (event_ids or timestamps)
  - display of unchanged fields omitted by default

---

End of CLAW Verifier UX v1.
