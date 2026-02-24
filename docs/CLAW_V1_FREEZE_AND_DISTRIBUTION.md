# CLAW v1 Freeze and Distribution

## Purpose (plain language)
This document defines what is frozen in CLAW v1, how CLAW v1 is distributed, and how CLAW v1 artifacts are referenced in external records. It exists to keep interpretation stable and verifiable under adversarial review.

## Scope‑locked v1 definition
CLAW v1 consists of exactly four utilities:
1) E‑sign attestations  
2) Timelines  
3) Personal liability attestations  
4) Agreements

## What is frozen vs what is not frozen
Frozen in v1:
- Meaning and scope as defined by `CLAW_V1_CANON.md`
- Trust boundaries as defined by `CLAW_V1_TRUST_BOUNDARY.md`
- Verification semantics and canonical JSON rules as defined by `docs/VERIFY.md`
- Artifact structure required for repo‑less verification of v1 bundles

Not frozen in v1:
- Internal implementation details and code organization
- Packaging mechanics that do not alter verification semantics
- Non‑canonical documentation that does not conflict with the Canon

## Versioning rules
CLAW follows SemVer.

Breaking changes (major):
- Any change to canonical JSON rules or hashing rules
- Any change to verification semantics or required artifacts
- Any change that alters the meaning or scope of the four utilities

Non‑breaking changes (minor/patch):
- Documentation clarifications that do not change meaning
- Implementation changes that preserve verification semantics

Document authority order (highest to lowest):
1) `CLAW_V1_CANON.md`
2) `CLAW_V1_TRUST_BOUNDARY.md`
3) `docs/VERIFY.md`
4) This document
5) v1.0.0 Release Notes

## Distribution artifacts
A CLAW v1 release includes:
- A repo‑less repro kit zip
- `SHA256SUMS.txt` covering all release files
- v1.0.0 Release Notes

A CLAW v1 repro kit includes:
- `pack.json`
- `sample_timeline.json`
- `sample_receipt.json`
- `esign_attestation.json`
- `personal_liability_attestation.json`
- `agreement_ref.json`
- `verify.py`
- `VERIFY.md`

## Referencing rules
When citing CLAW v1 artifacts in external records, include:
- Receipt: `receipt_id`, `timeline_id`, and `commitment`
- Timeline: `timeline_id` and `frozen_manifest_sha256`
- Pack: `pack_inputs_hash_sha256` and the SHA‑256 of `pack.json`
- Verifier: the SHA‑256 of `verify.py` and `VERIFY.md`

## Compatibility promise
The v1 verifier runs repo‑less on the bundle without network access. Future versions must not invalidate v1 artifacts or alter v1 verification semantics.

## If conflict, Canon controls
If any document, release note, UI, or explanation conflicts with `CLAW_V1_CANON.md`, the Canon controls.
