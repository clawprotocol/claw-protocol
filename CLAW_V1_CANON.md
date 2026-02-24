# CLAW v1 Canonical Definition

## 1. Purpose of CLAW v1 (Plain Language)
CLAW v1 provides deterministic, verifiable records for agreements, timelines, and attestations. It exists to reduce dispute ambiguity by producing evidence that can be independently verified without trusting CLAW operators.

## 2. What CLAW v1 Proves — and What It Does Not
CLAW v1 proves:
- That specific digital statements and event sequences existed in a fixed form at a specific time.
- That the recorded artifacts are tamper‑evident and replay‑verifiable.
- That attestations and references were recorded as structured evidence.

CLAW v1 does not prove:
- Legal enforceability.
- Truth of the underlying facts.
- Jurisdictional authority or legal conclusions.

## 3. Canonical Definitions of the Four Utilities
CLAW v1 consists of exactly four utilities:

1) **E‑Sign Attestations**  
Cryptographic proof that a named party attested to a document or statement at a specific time.  
Non‑binding and not a claim of enforceability.

2) **Timelines**  
Ordered, append‑only event logs with deterministic hashing.  
Tamper‑evident and replay‑verifiable.

3) **Personal Liability Attestations**  
Explicit statements of acknowledgement or responsibility by a party.  
Cryptographically recorded, non‑binding, but provable.

4) **Agreements**  
Deterministic drafting, hashing, redlining, and adjudication inputs.  
Outputs are non‑binding, reviewable, exportable, and appeal‑compatible.  
CLAW does not enforce outcomes.

## 4. Verification Model (Repo‑less, Deterministic, Local)
Verification must be possible without the CLAW repository or network access.  
All verification is:
- Local
- Deterministic
- Tamper‑evident

Artifact integrity is verified by hashing raw file bytes and comparing to recorded hashes.  
Semantic checks recompute event and manifest hashes using canonical JSON rules:
- UTF‑8 encoding
- `sort_keys=True`
- `separators=(",", ":")`

Any mismatch must fail verification.

## 5. Non‑Goals and Explicit Exclusions
CLAW v1 does **not** include:
- Enforcement of agreements or outcomes
- Legal advice
- Jurisdictional authority
- On‑chain execution or settlement
- Opinionated UX flows
- AI decision‑making presented as legal judgment

## 6. Interpretation Rules
Courts, counterparties, and auditors should read CLAW v1 artifacts as evidence records only.  
Artifacts indicate existence, sequence, and integrity of recorded statements and events.  
No artifact implies legal enforceability, jurisdiction, or legal conclusions.

## 7. Version Lock Statement
This document governs the meaning, scope, and interpretation of CLAW v1.  
If any output, documentation, or implementation conflicts with this document, this document controls.
