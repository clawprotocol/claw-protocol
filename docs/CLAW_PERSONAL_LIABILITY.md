# CLAW v1 Personal Liability Utility (Adjudication-First)

## Purpose
A classification + attestation utility that records user-declared attributes relevant to potential attribution and exposure in a dispute, **without providing legal advice**. Outputs are structured for later verification and adjudication.

This utility produces **evidence-grade declarations** (who / capacity / time window / control) that can be referenced by CLAW agreements (determination clauses) and timelines.

## Inputs (Permitted Data Categories)
Only high-level categories required to classify exposure may be requested:

- **Identity & role**: natural person / entity / agent / officer / employee / contractor
- **Capacity & authority**: individual capacity, representative capacity, delegated authority (categorical)
- **Relationship to subject matter**: owner, signer, operator, beneficiary, third-party (categorical)
- **Control & access**: operational control, custody, access rights (binary or categorical)
- **Jurisdictional context (non-specific)**: country/state/province for context only (no legal advice)
- **Time-bound facts**: start/end dates for roles, access, or control
- **Declared exclusions**: explicit statements such as “no authority” / “no control” / “not acting as agent”

Hard rule: do **not** collect legal strategy, privileged communications, or jurisdiction-specific legal conclusions.

## Definitions
### Liability Surface (CLAW)
A “liability surface” is the minimal set of user-declared attributes that establish **possible attribution** in a dispute. It is **not** a legal conclusion.

It is a structured description of:
- **Who** (identity/role)
- **In what capacity** (authority/agency)
- **During what time window**
- **With what control or access**

## Attestations
Each submission is a time-bound attestation that MUST:
- be tied to user identity and intent via the **E-Sign utility**
- include **valid_from** and optional **valid_to**
- be recorded as an immutable **Timeline event**
- be labeled “user-provided classification; not legal advice”

## Outputs (Allowed)
Outputs must be non-advisory and adjudication-usable:

- **Classification tags** (e.g., `agent`, `officer`, `no_authority_claimed`)
- **Exposure flags** (e.g., `control_asserted`, `custody_asserted`, `public_facing_role`)
- **Neutral warnings** (non-legal; no probability language)
- **Risk minimization patterns (general)** phrased as non-prescriptive patterns
  (e.g., “use explicit role scoping when acting on behalf of an entity”)

Hard rule: no legal conclusions, no individualized guidance, no predicted outcomes.

## Interfaces
- **E-Sign**: binds identity, intent, and capacity to the attestation.
- **Timelines**: stores attestations as evidence-grade events; freezing locks chronology.
- **Agreements (Determination Clauses)**: may reference liability attestations as inputs, but attestations do not decide outcomes by themselves.

## Explicit Exclusions (Hard Boundaries)
- No tax advice
- No asset concealment guidance
- No regulatory evasion
- No personalized legal instructions
- No adjudication or enforcement by CLAW (this utility only records structured attestations)
