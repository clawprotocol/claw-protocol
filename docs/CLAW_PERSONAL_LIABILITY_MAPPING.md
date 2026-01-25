# CLAW v1 Personal Liability — Deterministic Mapping (Normative)

This document defines how a `notice` event with `liability_attestation` payload
is deterministically mapped into `claw.liability_assessment.v1`.

No probabilistic language. No legal conclusions. No jurisdiction-specific advice.

## Input: Timeline Notice Event
Event type: `notice`

Payload path:
- notice.liability_attestation (object)

Required fields in notice.liability_attestation:
- role
- capacity
- relationship
- control_flags (array of strings)
- valid_from (RFC3339)
- valid_to (RFC3339|null)
Optional:
- declared_exclusions (array of strings)

## Output: liability_assessment_v1
### subject
- subject.role = input.role
- subject.capacity = input.capacity
- subject.relationship = input.relationship
- subject.valid_from = input.valid_from
- subject.valid_to = input.valid_to

### tags (deterministic)
Always emit:
- `role.<role>`
- `capacity.<capacity>`
- `relationship.<relationship>`

If declared_exclusions contains "no_authority":
- emit `exclusion.no_authority_claimed`

### flags (deterministic)
For each string in control_flags, emit:
- `control.<flag>` (normalized)

If valid_to is null:
- emit `time_window.open_ended`

### warnings (neutral, deterministic templates)
If any control_flags present:
- “Control/access was asserted during the declared window.”

If declared_exclusions contains "no_authority":
- “No authority was claimed by the user during the declared window.”

If time_window.open_ended:
- “The declaration window is open-ended (valid_to is null).”

### patterns (general, non-prescriptive)
Patterns are selected ONLY from a fixed allowlist keyed by flags/tags.
No custom free-text generation.

Allowlist (v1):
- If capacity.representative OR role.agent:
  - “Use explicit role scoping when acting on behalf of an entity.”
- If any control.*:
  - “Maintain contemporaneous records of delegated authority and revocation dates.”
- If time_window.open_ended:
  - “Define explicit start/end dates for roles and access where feasible.”

### disclaimers (required)
Always include:
- “This is not legal advice.”
- “User-provided data may be incomplete or inaccurate.”
- “Outputs are classifications for evidentiary use and may be reviewed by counsel.”

## Prohibitions
- No output may include legal conclusions or probability language.
- No output may reference specific laws, agencies, filings, or jurisdictions.
- No output may propose concealment, evasion, or individualized instructions.
