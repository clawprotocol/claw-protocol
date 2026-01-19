# CLAW-PROOF-v0 — Compliance Checklist

This checklist is intended for auditors, courts, and hostile verifiers.

## 1) Protocol identity
- [ ] Protocol identifier is explicitly declared (e.g., `CLAW-PROOF-v0`).
- [ ] Hash algorithm is explicitly declared (SHA-256).
- [ ] Canonicalization rules are explicitly declared (canonical JSON or equivalent).

## 2) Receipt completeness (minimum)
A receipt MUST contain enough to re-derive the anchored commitment and locate it on-chain.

- [ ] Receipt includes `epoch` or batch identifier
- [ ] Receipt includes `txid` (Bitcoin transaction ID)
- [ ] Receipt includes the expected commitment hash (the value embedded in OP_RETURN)
- [ ] Receipt includes the leaf/entry hash for the claimant payload (or the canonical payload hash)
- [ ] If Merkle batching is used: receipt includes Merkle path (siblings + index/side)
- [ ] Receipt includes network context (mainnet/testnet) or verifier can infer it

## 3) Determinism & reproducibility
- [ ] Verifier recomputes all hashes from declared rules (no hidden steps)
- [ ] Canonical encoding produces identical bytes across platforms
- [ ] Receipt verification is a pure function of: receipt + public chain data
- [ ] No reliance on private servers / proprietary APIs (public explorer endpoints acceptable)

## 4) On-chain anchoring requirements
- [ ] Commitment is found in a Bitcoin output script (OP_RETURN)
- [ ] Commitment format is unambiguous (e.g., fixed-length 32-byte push)
- [ ] Transaction is accepted by consensus and retrievable from public sources
- [ ] (Optional but recommended) A confirmation threshold is recorded (e.g., 6+)

## 5) Verifier requirements
- [ ] Single-command verification exists (script or binary)
- [ ] Verifier exits non-zero on failure
- [ ] Verifier prints machine-parseable success line (OK + txid + commitment)
- [ ] Verifier prints actionable error messages on mismatch

## 6) Public artifacts
- [ ] `STATE.md` lists the canonical anchors (Genesis and subsequent)
- [ ] Repo contains at least one example receipt that verifies against a listed anchor
- [ ] Verifier command in README matches actual repo scripts

## 7) Integrity hygiene
- [ ] `.gitignore` excludes PSBTs, secrets, local runtime artifacts
- [ ] No embedded private keys, cookies, wallet files, or RPC credentials in repo
- [ ] Release tags exist for anchored protocol milestones
