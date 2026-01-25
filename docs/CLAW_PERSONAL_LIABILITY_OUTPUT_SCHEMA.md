# CLAW v1 Personal Liability — Output Schema (Normative)

This schema defines the ONLY allowed machine outputs of the Personal Liability utility.
It is non-advisory, jurisdiction-agnostic, and suitable for later adjudication.

## liability_assessment_v1 (JSON)

Required top-level fields:
- schema: "claw.liability_assessment.v1"
- created_at: RFC3339 UTC timestamp
- inputs_attested_event_id: timeline event_id for the underlying liability attestation notice
- subject: object describing user-declared role/capacity (no PII required)
- tags: list of normalized strings
- flags: list of normalized strings
- warnings: list of neutral strings (no probability language)
- patterns: list of general mitigation patterns (non-prescriptive)
- disclaimers: list of strings

### subject (object)
- role: one of ["natural_person","entity","agent","officer","employee","contractor","other"]
- capacity: one of ["individual","representative","delegated","unknown"]
- relationship: one of ["owner","signer","operator","beneficiary","third_party","unknown"]
- valid_from: RFC3339 timestamp
- valid_to: RFC3339 timestamp | null

### tags (examples)
- "role.agent"
- "capacity.representative"
- "relationship.operator"
- "exclusion.no_authority_claimed"

### flags (examples)
- "control.asserted"
- "custody.asserted"
- "public_facing_role"
- "delegation.present"
- "time_window.open_ended"

### warnings (rules)
- Must be neutral and factual (e.g., “Operational control was asserted during the declared window.”)
- No legal conclusions (“liable”, “not liable”, “illegal”, etc.)
- No probabilities (“likely”, “high risk”, etc.)

### patterns (rules)
- Must be general patterns, not instructions.
- Must not reference jurisdiction-specific entities, statutes, or filings.
Examples:
- “Use explicit role scoping when acting on behalf of an entity.”
- “Separate operational control from ownership where operational duties are delegated.”
- “Maintain contemporaneous records of delegated authority and revocation dates.”

### disclaimers (required)
Include at least:
- “This is not legal advice.”
- “User-provided data may be incomplete or inaccurate.”
- “Outputs are classifications for evidentiary use and may be reviewed by counsel.”

## Prohibited outputs (hard ban)
- Personalized legal advice
- Tax advice
- Asset concealment or evasion guidance
- Predictions or probability statements about outcomes
