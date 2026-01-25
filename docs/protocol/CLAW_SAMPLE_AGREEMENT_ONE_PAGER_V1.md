# CLAW Sample Agreement — One Page (v1)

Status: Demonstration Template · Non-Advisory · Mechanical Consumption Only

Canonical Reference:
- Liability Classification: CLAW_PERSONAL_LIABILITY.md
- Determination Logic: CLAW_AUTOMATED_DETERMINATION_CLAUSE_V1.md

---

## 1. Parties

This Agreement is entered into by and between:

Party A: __________________________  
Party B: __________________________  

Effective Date: ____________________

---

## 2. Purpose

The Parties agree to use a CLAW-generated liability assessment as a mechanical input to determine whether a defined action is permitted, conditionally permitted, or blocked.

This Agreement does not constitute legal advice. CLAW does not adjudicate disputes, enforce outcomes, or interpret law. All substantive decisions remain with the Parties and their designated adjudicators.

---

## 3. Definitions

Timeline  
A CLAW evidentiary ledger that records immutable, timestamped events.

Liability Attestation Event  
A timeline event of type `notice` containing a `liability_attestation`.

Liability Assessment  
The output of `claw.liability_assessment.v1`, derived deterministically from a Liability Attestation Event.

Determination Clause  
The canonical mechanical rule defined in `CLAW_AUTOMATED_DETERMINATION_CLAUSE_V1.md`.

---

## 4. Authoritative Inputs (No Raw User Input)

The Parties agree that the sole authoritative inputs to any automated determination under this Agreement SHALL be the following fields from a CLAW Liability Assessment:

- assessment.tags[]
- assessment.flags[]
- assessment.warnings[]
- assessment.schema_version
- assessment.assessment_time

Raw user submissions, notice text, timeline metadata, and free-form attestations SHALL NOT be consumed by any determination logic.

---

## 5. Retrieval Method

The current liability state may be retrieved using:

GET /v1/timelines/{timeline_id}/liability/latest

The response SHALL include:

- timeline_id
- event_id
- assessment (as defined above)

---

## 6. Mechanical Determination

The Parties adopt the Determination Clause v1. The output of the determination is strictly limited to:

{
  "determination": "BLOCKED | CONDITIONAL | CLEAR",
  "source": "claw.liability_assessment.v1",
  "event_id": "...",
  "assessment_time": "..."
}

No explanations, recommendations, probabilities, or legal conclusions are permitted.

---

## 7. Contractual Effect (Example Action Gate)

The Parties agree that the following contractual effects apply:

If determination = BLOCKED  
The Action is not permitted until a new Liability Attestation Event is submitted and produces a non-BLOCKED determination.

If determination = CONDITIONAL  
The Action is permitted only after written acknowledgement by both Parties, or their designated counsel, that conditions have been reviewed.

If determination = CLEAR  
The Action is permitted.

Action governed by this Agreement:  
______________________________________________________

---

## 8. Human Override and Adjudication

Nothing in this Agreement limits either Party’s right to:

- consult legal counsel,
- dispute factual accuracy,
- seek adjudication by a court or arbitrator.

CLAW outputs function solely as evidentiary and computational inputs.

---

## 9. Signatures

Party A Signature: ________________________   Date: ___________

Party B Signature: ________________________   Date: ___________
