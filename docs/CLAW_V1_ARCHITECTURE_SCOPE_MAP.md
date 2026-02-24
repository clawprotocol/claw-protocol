# CLAW v1 — Architecture & Scope Map

## Utilities vs Infrastructure (Authoritative)

### Purpose
This document defines the exact scope of CLAW v1 at launch and during pilot.
It exists to prevent category confusion, scope creep, and accidental protocol expansion.

If something does not clearly fit in one of the layers below, it is out of scope.

---

## I. CORE UTILITIES (User-Facing, Evidence-Producing)

These are the only CLAW utilities in v1.
They produce records. They do not enforce outcomes.

### 1) Timeline

Purpose: Neutral record of events — what happened, when.
- Draft → Frozen → Receipted
- Freeze is irreversible
- Deterministic hashing
- Referencable by other utilities
- No interpretation
- No analysis
- No opinions

Produces: Evidence rail  
Does NOT: Decide facts, infer meaning, or judge events

---

### 2) E-Sign Attestation

Purpose: Attest that parties signed or acknowledged a document at a time.
- Familiar e-sign UX (DocuSign-like)
- Multi-party supported
- Explicit signing intent
- Deterministic signed artifact
- Timestamped
- Hash-anchored (Bitcoin or simulated in pilot)

Produces: Signature evidence  
Does NOT: Assert enforceability, execute contracts, or manage wallets

---

### 3) Personal Liability Attestation

Purpose: Allow an individual to describe personal circumstances and context.

Two sections only:
- Attestable Facts
- Public Legal Context (educational reference only)

Allowed:
- Describing structures (e.g. LLCs, trusts, defaults)
- Referencing publicly known legal patterns
- Preserving personal narrative as evidence

Not allowed:
- Advice
- Recommendations
- Risk scoring
- Legal conclusions

Produces: Personal evidentiary record  
Does NOT: Assess liability or provide legal advice

---

### 4) Agreements

Purpose: Multi-party drafting and versioned agreement records.
- Multi-party drafting
- Deterministic versioning
- Deterministic redlines
- Opt-in inclusion of versions/diffs
- Exportable agreement packets

Optional:
- Non-binding analytical review only if all parties opt in

Produces: Agreement evidence  
Does NOT: Enforce, adjudicate, or bind parties

---

## II. INFRASTRUCTURE LAYERS (Non-Utility, Non-Decisional)

These support CLAW.
They are not products, not utilities, and not sources of truth.

---

### A. Treasury (Infrastructure)

Purpose: Accounting and flow visibility.
- Ledgered inflows/outflows
- Fee tracking
- Non-custodial or delegated custody only
- No commingling
- No yield
- No financial advice

Treasury is not a utility and not user-facing logic.

---

### B. Payments (Interfaces)

Purpose: Allow users to pay for CLAW services.

Examples:
- Coinbase Pay
- MoonPay

Payments:
- Are interfaces only
- Do not affect protocol logic
- Do not gate truth or verification

---

### C. Oracles (Support Only)

Purpose: Price reference and accounting support.

Examples:
- Chainlink
- Interchain pricing sources (future)

Rules:
- Informational only
- No oracle-driven decisions
- No adjudication
- No enforcement

---

### D. Storage

Purpose: Persist documents and bundles.

v1 Canonical:
- Web2 storage
- Deterministic files
- Hash-first architecture

Later (non-breaking):
- IPFS / Arweave

Storage upgrades must not change semantics.

---

### E. Chains

Purpose: Anchoring and timestamping.
- Bitcoin anchoring (live or simulated)
- No smart contracts required
- No enforcement
- No custody

Chains provide timestamps, not authority.

---

## III. HARD BOUNDARIES (NON-NEGOTIABLE)

CLAW v1 does not:
- Give legal advice
- Enforce outcomes
- Decide disputes
- Hold funds
- Execute contracts
- Replace courts or lawyers
- Infer intent
- Score or rank users
- Require identity systems
- Depend on live chains to function

If a feature requires any of the above → out of scope.

---

## IV. LLM USAGE CONSTRAINTS (OPENAI / CURSOR)

LLMs may:
- Assist with drafting
- Improve clarity
- Structure language
- Help organize user input

LLMs must never:
- Assert truth
- Decide outcomes
- Interpret legality
- Replace human judgment

All outputs must remain:
- Reviewable
- Non-binding
- User-controlled
- Independently verifiable

---

## V. SINGLE SENTENCE TRUTH TEST

At all times, this must remain true:

“CLAW creates tamper-evident, independently verifiable records and agreements — without enforcing outcomes or giving legal advice.”

If a proposed change weakens this sentence, it is not allowed.

---

## VI. INSTRUCTION TO CURSOR / GPT

If a request would:
- Add a new utility
- Expand a utility’s authority
- Blur utility vs infrastructure
- Introduce enforcement or advice

You must respond:

“This exceeds CLAW v1 scope. I can help clarify or refine existing behavior, but I cannot add this.”

---

## Status

Scope: Frozen  
Architecture: Clean  
Pilot Risk: Contained

This document is authoritative for CLAW v1.
