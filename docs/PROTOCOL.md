# CLAW Protocol — Index (v0)

This document is the human-facing index for the CLAW v0 protocol surface.

If you are verifying a CLAW proof/receipt, start with **VERIFY.md**.

## Canonical documents

- **Genesis Declaration:** `docs/GENESIS.md`
- **Proof Specification:** `CLAW-PROOF-v0.md`
- **Verification Guide:** `docs/VERIFY.md`
- **Pricing / tiers (non-normative):** `docs/pricing.md`
- **Community Pass (non-normative):** `docs/community-pass.md`

## Immutability rule

Once the repository is tagged **`genesis-v0`**, the following are considered **frozen for verification**:

- `CLAW-PROOF-v0.md`
- `docs/GENESIS.md`
- `docs/VERIFY.md`
- `docs/HASHES.genesis-v0.sha256`
- Any included canonical test vectors / example receipts referenced by VERIFY.md

Any future revision MUST use a new identifier (e.g., `CLAW-PROOF-v1`) and a new tag (e.g., `genesis-v1`).

## Scope

CLAW v0 defines:
- deterministic hashing / canonicalization rules (per spec)
- receipt/proof structures
- verification procedure
- optional anchoring surfaces (e.g., Bitcoin OP_RETURN)

CLAW v0 does NOT define:
- legal advice, enforceability, or jurisdictional outcomes
- identity/KYC requirements
- business terms outside protocol verification
