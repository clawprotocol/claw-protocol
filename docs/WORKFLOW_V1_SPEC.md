# CLAW v1 Workflow Layer Specification

## Purpose
This document defines a deterministic, end‑to‑end workflow layer for CLAW v1 that makes the four utilities usable by counterparties and reviewers without changing verification semantics. The workflow layer is evidence‑first, non‑advisory, and non‑enforcing.

## Roles
- **Author:** creates and edits artifacts prior to freeze.
- **Signer:** attests or accepts artifacts; may be a named party.
- **Counterparty reviewer:** reviews frozen outputs and requests changes out‑of‑band.
- **Auditor/Verifier (read‑only):** runs local verification; does not mutate artifacts.

## Trust Boundary
- UI is informational only.
- Verification is file‑based and deterministic.
- No trust in servers or operators is required to verify.
- Any conflict resolves in favor of cryptographic verification.

## Workflows

### A) Utility workflow (all utilities)
**Create → Review → Sign/Attest → Freeze → Export repro kit → Verify → Share**

1) **Create:** Author generates an initial artifact using deterministic inputs.  
2) **Review:** Counterparty reviewer inspects outputs and requests edits externally.  
3) **Sign/Attest:** Signer records an attestation (optional signature placeholder only).  
4) **Freeze:** Artifact is frozen and its hash becomes immutable for verification.  
5) **Export:** A repo‑less repro kit is produced with `pack.json`, artifacts, and `verify.py`.  
6) **Verify:** Any party runs `verify.py` locally to confirm integrity.  
7) **Share:** Artifacts and pack are shared as evidence records.

### B) Agreement workflow
**Draft → Redline/versioning → Acceptance → Attach to timeline → Export**

1) **Draft agreement:** Create the initial agreement document and hash.  
2) **Redline/versioning:** Propose deterministic redlines as structured diffs.  
3) **Acceptance:** Counterparty accepts a specific version by hash.  
4) **Attach to timeline:** Record acceptance as a timeline event reference.  
5) **Export:** Produce repro kit and verify file‑based integrity.

### C) Dispute packet workflow (inputs only)
**Gather inputs → Assemble packet → Export + Verify**

1) **Gather inputs:** Collect references to timeline(s), receipts, attestations, and agreement versions.  
2) **Assemble packet:** Create a dispute packet that lists claims and referenced artifacts.  
3) **Export + Verify:** Create a repro kit with the packet and verify integrity.  
4) **No outcomes:** The packet contains inputs only; it includes no decisions or judgments.

## Demo Endpoint (Happy Path)
`POST /v1/workflow/demo/run` executes a single-button demo flow:
create timeline → append events → freeze → receipt → attestations → export bundle zip → verify.

Purpose: press one button and produce a verifiable `bundle.zip` suitable for live demos.

### Demo Script (10 lines)
1) Click **Run Demo**.  
2) “This creates a timeline and three events.”  
3) “We freeze the timeline to seal the manifest hash.”  
4) “A receipt is created locally (no blockchain).”  
5) “We add e‑sign and liability attestations.”  
6) “A bundle.zip is exported.”  
7) “The verifier runs on the zip.”  
8) “PASS means all hashes match.”  
9) “Any tamper flips PASS → FAIL.”  
10) “This is evidence‑only, not enforcement.”

## Non‑Goals (Explicit)
- No legal advice or legal judgment
- No enforcement or jurisdictional claims
- No server‑side trust requirement
- No network dependency for verification
- No binding adjudication or outcome issuance

## Determinism Requirements
- Canonical JSON rules are used for hashing.
- Identical inputs must yield identical outputs and hashes.
- Repo‑less verification must pass on untouched artifacts and fail on any byte change.
