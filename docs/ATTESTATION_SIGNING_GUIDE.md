# CLAW v1 Attestation Signing Guide

## Purpose
This guide describes how to create, sign, freeze, export, and verify CLAW v1 attestations. Attestations are evidence artifacts only. They do not provide legal advice, enforceability, or jurisdiction.

## Trust Boundary
- Viewer/UI is informational only.  
- Verification is cryptographic and file‑based.  
- `verify.py` is authoritative.

## Workflow (E‑Sign or Personal Liability)
1) **Create attestation** with deterministic inputs.  
2) **Sign** using a deterministic placeholder signature.  
3) **Freeze** to seal the attestation state.  
4) **Export** a repo‑less repro kit.  
5) **Verify** locally with `verify.py`.  

## Relationship to Timelines
Exporting an attestation repro kit includes a timeline event referencing the attestation file. This makes the attestation attachable to timelines without changing verification semantics.

## Verification Steps
1) Open a terminal in the repro kit folder.  
2) Run:
```bash
python verify.py
```
3) Expect `PASS`.

## Tamper Check
1) Modify one byte of any artifact.  
2) Re‑run `python verify.py`.  
3) Expect `FAIL`.

## Notes
Attestations are non‑binding evidence records only.
