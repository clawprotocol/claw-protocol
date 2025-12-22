# HUMAN_OVERRIDE.md
**Status:** Draft v0.1  
**Purpose:** Define when and how humans intervene — and when they must not.

## Default State
**Humans are not involved.**

## Valid Override Triggers
Human intervention is allowed **only** if:
- Clause explicitly sets `human_required = true`
- Jurisdiction mandates human consent
- Conflicting signatures detected
- Value exceeds defined threshold
- Dispute is formally raised

## Override Characteristics
When triggered:
- Read-only by default
- Explicit consent required
- Logged as a proof event
- Fully auditable

## Override Object
```json
{
  "override_id": "uuid",
  "trigger_reason": "string",
  "human_actor": "did | wallet",
  "decision": "approve | reject | amend",
  "timestamp": "iso8601"
}
