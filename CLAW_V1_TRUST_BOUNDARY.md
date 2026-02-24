# CLAW v1 Trust Boundary & Threat Model

## 1. Purpose of This Document
This document defines explicit trust boundaries for CLAW v1 to prevent misinterpretation of evidence integrity as authority or enforcement. It is written for courts, auditors, counterparties, and technical reviewers who require adversarial‑safe, reproducible verification.

## 2. What CLAW v1 Trusts
- Local file system access by the verifier
- Deterministic cryptographic hashing
- Canonical JSON rules as specified
- Independent execution of verification

## 3. What CLAW v1 Does NOT Trust
- CLAW operators
- CLAW servers
- Network availability
- UI renderings
- Human testimony
- User intent or truthfulness

## 4. Explicit Threat Model
CLAW v1 assumes:
- Files may be copied, shared, or disclosed
- Counterparties may attempt to tamper with artifacts
- Viewers may misinterpret artifacts
- Verification may be run by hostile or skeptical parties

## 5. What Attacks CLAW v1 Detects
- Byte‑level modification of any artifact
- Reordering or mutation of timeline events
- Mismatch between timeline manifest and receipt commitment
- Partial disclosure or selective omission, detectable by missing hashes

## 6. What CLAW v1 Does NOT Prevent
- Lying at the time of attestation
- Coercion of signers
- Off‑record agreements
- Legal unenforceability
- Misuse of artifacts outside their evidentiary purpose

## 7. Relationship to Verification & Viewer
- The verifier is authoritative
- The viewer is informational only
- Any conflict resolves in favor of cryptographic verification

## 8. Interpretive Rule
This document governs trust interpretation for CLAW v1. The canon governs meaning. No document, UI, or explanation implies authority beyond evidence integrity.
